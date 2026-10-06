import AppKit
import CryptoKit
import Foundation

// Serialized representations only; promised data that cannot be read fails before Copy.
struct Representation: Codable, Equatable { let type: String; let data: Data }
struct Snapshot: Codable, Equatable { let changeCount: Int; let items: [[Representation]] }
struct Request: Decodable {
    let operation: String
    let name: String?
    let original: String
    let owned: String
    let budget: Int
    let expectedHash: String?
    let fixture: String?
}
struct Failure: Error { let code: String }
let serializationLimit = 24 * 1024 * 1024
func snapshot(_ board: NSPasteboard, _ budget: Int) throws -> Snapshot {
    if #available(macOS 15.4, *) {
        guard board.accessBehavior != .alwaysDeny else { throw Failure(code: "clipboard-read-denied") }
    }
    let count = board.changeCount
    let objects = board.pasteboardItems ?? []
    guard !objects.isEmpty || (board.types ?? []).isEmpty else { throw Failure(code: "clipboard-items-unreadable") }
    guard objects.count <= 128 else { throw Failure(code: "clipboard-item-budget") }
    var bytes = 0
    var types = 0
    var items: [[Representation]] = []
    for item in objects {
        var representations: [Representation] = []
        for type in item.types {
            types += 1
            guard types <= 2048, let data = item.data(forType: type) else { throw Failure(code: "clipboard-unreadable") }
            bytes += type.rawValue.utf8.count + data.count
            guard bytes <= budget else { throw Failure(code: "clipboard-byte-budget") }
            representations.append(Representation(type: type.rawValue, data: data))
        }
        items.append(representations)
    }
    guard count == board.changeCount else { throw Failure(code: "clipboard-changed-during-read") }
    return Snapshot(changeCount: count, items: items)
}
func load(_ path: String) throws -> Snapshot {
    let url = URL(fileURLWithPath: path)
    let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? serializationLimit + 1
    guard size <= serializationLimit else { throw Failure(code: "clipboard-snapshot-budget") }
    return try JSONDecoder().decode(Snapshot.self, from: Data(contentsOf: url))
}
func save(_ value: Snapshot, _ path: String) throws {
    let data = try JSONEncoder().encode(value)
    guard data.count <= serializationLimit else { throw Failure(code: "clipboard-snapshot-budget") }
    try data.write(to: URL(fileURLWithPath: path))
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path)
}
func hash(_ text: String) -> String {
    SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
}
func matchesText(_ board: NSPasteboard, _ expected: String?) -> Bool {
    guard let expected, let text = board.string(forType: .string) else { return false }
    return hash(text) == expected
}
func restore(_ board: NSPasteboard, _ original: Snapshot, _ owned: Snapshot, _ budget: Int) throws -> String {
    // Construct every representation before touching the pasteboard.
    let objects: [NSPasteboardItem] = try original.items.map { representations in
        let item = NSPasteboardItem()
        for representation in representations {
            guard item.setData(representation.data, forType: NSPasteboard.PasteboardType(representation.type)) else {
                throw Failure(code: "clipboard-representation-restore-failed")
            }
        }
        return item
    }
    guard try snapshot(board, budget) == owned, board.changeCount == owned.changeCount else { return "preserved-new-content" }
    // NSPasteboard has no compare-and-swap API: the final count check and write are consecutive native calls.
    board.clearContents()
    guard objects.isEmpty || board.writeObjects(objects) else { throw Failure(code: "clipboard-restore-failed") }
    let restored = try snapshot(board, budget)
    guard restored.items == original.items else { throw Failure(code: "clipboard-restore-verification-failed") }
    return "restored"
}
func fixture(_ board: NSPasteboard, _ name: String?, _ kind: String?) throws -> String {
    guard let name, name.hasPrefix("d-pi-validation-") else { throw Failure(code: "fixture-requires-private-pasteboard") }
    if kind == "remove" { board.releaseGlobally(); return "removed" }
    let first = NSPasteboardItem()
    let second = NSPasteboardItem()
    if kind == "original" {
        first.setString(String(repeating: "中文😀", count: 200_000), forType: .string)
        first.setData(Data([137, 80, 78, 71, 0, 255]), forType: .png)
        first.setString("<b>private fixture</b>", forType: .html)
        second.setData(Data([0, 255, 128, 1]), forType: NSPasteboard.PasteboardType("local.d-pi.binary"))
    } else if kind == "oversized" {
        first.setData(Data(repeating: 1, count: 17 * 1024 * 1024), forType: NSPasteboard.PasteboardType("local.d-pi.binary"))
    } else {
        first.setString(kind == "user" ? "USER_NEW_COPY" : "TEST_OWNED_COPY😀", forType: .string)
    }
    board.clearContents()
    guard board.writeObjects(kind == "original" ? [first, second] : [first]) else { throw Failure(code: "fixture-write-failed") }
    return "fixture-written"
}
do {
    let request = try JSONDecoder().decode(Request.self, from: FileHandle.standardInput.readDataToEndOfFile())
    guard request.budget > 0, request.budget <= 16 * 1024 * 1024 else { throw Failure(code: "invalid-clipboard-budget") }
    let board = request.name.map { NSPasteboard(name: NSPasteboard.Name($0)) } ?? NSPasteboard.general
    var result: [String: Any] = [:]
    switch request.operation {
    case "capture":
        let value = try snapshot(board, request.budget)
        try save(value, request.original)
        result = ["kind": "captured", "changeCount": value.changeCount, "items": value.items.count]
    case "before":
        let reference = try load(FileManager.default.fileExists(atPath: request.owned) ? request.owned : request.original)
        guard board.changeCount == reference.changeCount, try snapshot(board, request.budget) == reference else { throw Failure(code: "clipboard-changed-before-copy") }
        result = ["kind": "ready"]
    case "mark":
        let original = try load(request.original)
        let value = try snapshot(board, request.budget)
        guard value.changeCount != original.changeCount, matchesText(board, request.expectedHash), value.changeCount == board.changeCount else {
            throw Failure(code: "clipboard-copy-not-owned")
        }
        try save(value, request.owned)
        result = ["kind": "owned", "changeCount": value.changeCount]
    case "restore":
        let original = try load(request.original)
        if board.changeCount == original.changeCount {
            result = ["kind": try snapshot(board, request.budget) == original ? "unchanged" : "preserved-new-content"]
        } else if FileManager.default.fileExists(atPath: request.owned) {
            let owned = try load(request.owned)
            result = ["kind": board.changeCount == owned.changeCount ? try restore(board, original, owned, request.budget) : "preserved-new-content"]
        } else if request.expectedHash != nil, let current = try? snapshot(board, request.budget), matchesText(board, request.expectedHash), current.changeCount == board.changeCount {
            // A Copy assertion may have thrown before mark; exact fixture text is still eligible.
            result = ["kind": try restore(board, original, current, request.budget)]
        } else {
            result = ["kind": "preserved-new-content"]
        }
    case "count": result = ["kind": "count", "changeCount": board.changeCount]
    case "fixture": result = ["kind": try fixture(board, request.name, request.fixture)]
    case "verify":
        let original = try load(request.original)
        result = ["kind": "verified", "equal": try snapshot(board, request.budget).items == original.items]
    default: throw Failure(code: "unknown-clipboard-operation")
    }
    let output = try JSONSerialization.data(withJSONObject: result)
    FileHandle.standardOutput.write(output)
} catch {
    let code = (error as? Failure)?.code ?? "clipboard-native-error"
    FileHandle.standardError.write(Data((code + "\n").utf8))
    exit(1)
}
