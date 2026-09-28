interface BuildInfo {
  version: string;
  commit: string;
  dirty: boolean;
  id: string;
}
declare const __D_PI_BUILD__: BuildInfo;
// Direct source tests have no bundle identity; never pretend they are a release.
export const BUILD_INFO: Readonly<BuildInfo> =
  typeof __D_PI_BUILD__ === "undefined"
    ? { version: "source", commit: "unbundled", dirty: true, id: "unbundled" }
    : __D_PI_BUILD__;
