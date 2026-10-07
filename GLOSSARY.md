# OMP 桌面会话客户端

让用户通过图形界面表达开发需求、查看 OMP 的执行过程和结果，并继续同一项工作。这里定义领域语言；界面用词见[产品术语](docs/product-terminology.md)，行为合同与实现落点见[文档导航](docs/README.md)。

## Language

### 工作与目录

**App Thread（Thread）**：用户在桌面应用中持续推进的一项工作，拥有独立的草稿、提交与原生会话关联；同一项目可以有多个 Thread，身份不因窗口、模型或进程变化而改变。
_Avoid_：OMP 会话、Workspace、运行（均不能替代 Thread）

**项目（Project）**：用户组织和推进代码工作的对象；项目原目录与其 Git worktree 可以作为不同 Thread 的工作目录，项目名称不等于实际文件身份。

**工作目录（Working Directory）**：Thread 实际读写文件的目录，可为项目原目录或独立 Git worktree；多个 Thread 共用一个目录时共享文件状态，目录级执行信任也不等于 Thread 私有权限。
_Avoid_：Workspace（指目录时）、项目名称、分支名（均不能代替实际目录）

**Git worktree**：Git 管理的一个工作树及其检出目录，可作为 Thread 的工作目录；OMP 子 Agent 的临时 worktree 与 App Thread 的目录关联各有生命周期。
_Avoid_：Thread、自动文件隔离（共用目录时不成立）

**Workspace（工作区）**：工具或开发环境组织工作的通用称呼；当前 d-pi 不以它定义额外业务实体，谈论具体工作或目录时使用 Thread 或工作目录。

**原生会话（Native Session）**：OMP 拥有的工作记录及上下文；App Thread 关联原生会话，而非取代其身份或历史。
_Avoid_：App Thread、GUI 消息列表

**原生会话绑定（Native Session Binding）**：App 保存的 Thread 与配置上下文、原生会话身份及历史位置之间的关联；绑定不是进程存活或可继续执行的证明。

**会话镜像（Conversation Projection）**：客户端依据 OMP 已提供的事件与历史维护的展示状态；它不拥有另一份可写的原生历史或执行事实。
_Avoid_：客户端执行引擎

### 输入与执行证据

**草稿（Draft）**：用户尚未提交的可编辑输入，不属于 OMP 已接受的输入。

**冻结提交（Frozen Submission）**：一次发送固定的原文、来源版本与交接身份；它独立于后来编辑的草稿和 OMP 执行，结果未知不能凭内容去重或自动重发。

**提交收据（Submission Receipt）**：App 持久保存的提交交接事实，分别表达派发、调用确认与已观测结果；收据本身不提供原生幂等保证。

**调用确认（ACK / acknowledged）**：OMP 返回与一次提交准确关联的成功调用回执；它不证明业务接受、队列消费或执行完成。

**业务接受（Business Acceptance / accepted）**：原生以可关联证据确认输入已进入对应业务处理；不能由按钮点击、派发或 ACK 推断。

**执行结果（Execution Outcome）**：原生执行产生的结果或失败证据；提交已得到 ACK 仍可随后失败，缺证据保持未知。

**排队追加（Follow-up）**：执行期间提交后续需求，交由 OMP 接受后等待消费；普通发送采用该意图，提交意图本身不是已入队证据。

**干预（Steer）**：显式提交用于调整当前工作的要求；调用成功不证明要求已经被采纳。
_Avoid_：停止（另一种操作）

**待回答交互（Interaction）**：OMP 发起、需要用户提供回答或确认的交互；回答回执与执行进展分别表达。

### 运行与生命周期

**Runtime**：d-pi 接入 OMP 执行能力时的运行状态与生命周期视角；它不是新的 Agent 引擎、原生会话或独立业务实体。

**SessionHost**：App 的会话宿主，拥有原生连接、请求关联和事件镜像的作用域；OMP 仍拥有执行、真实队列、工具和原生历史。

**终端会话（Terminal Session）**：用户直接交互的一次 shell/PTY 会话，身份不因面板隐藏或重挂载改变；它不是 App Thread、OMP 原生会话或 Agent 的 shell 工具。已退出的 shell 不因显示重连而恢复。

**TerminalHost**：D-40 确定的专用用户终端宿主，拥有 PTY/shell 和有界显示恢复屏幕；Main 管准入与监督。它与承载 OMP 连接的 SessionHost 分离，当前尚未实现。

**终端屏幕快照（Terminal Screen Snapshot）**：某个输出水位的终端显示投影及有限 scrollback，用于恢复现存会话的显示；不是完整输出历史、进程检查点或命令成功证据。

**原生进程实例（Native Process Instance）**：一次存活的 OMP 宿主进程；进程身份不代替 Thread 或原生会话身份。

**连接代次（Connection Generation）**：一次连接作用域的身份，用于识别迟到事件与命令；重新连接不等于创建 Thread，局部异步请求计数也不是连接代次。

**关闭窗口**：关闭当前交互窗口，应用和正在进行的工作继续存在。
_Avoid_：退出应用、停止、归档 Thread

**退出应用**：结束整个桌面应用，并按退出协调处理尚未完成的工作与资源。

**项目执行信任**：允许在指定工作目录启动 OMP 并加载原生项目配置/扩展，D-40 用户终端启动也受此准入约束；它与 App 文件读取授权分开，不是操作系统或工具沙箱。

### 变化与旁路工作

**Git 当前差异（Git Current Changes）**：Git 当前采样范围内的差异，可能包含用户、Agent 或其他程序的修改；不能仅据此判断作者或执行归属。

**工具修改证据（Tool Change Evidence）**：原生工具记录能支持的文件修改信息；证据覆盖与实际文件当前差异可能不同，不代表完整 Run 归属。

**Run Changes**：预留的变化归属能力名称；Run 边界、归属规则和 Revert 效果仍待相应功能定义，当前不能当作原生对象或 Git 命令。

**Git Panel**：围绕 OMP 工作流呈现差异、检查与 Git 操作的应用面板，不以完整通用 Git 客户端为目标。

**Side Chat（旁路问答）**：关联主 Thread 和原文位置的独立问答，保留发起时上下文、历史与自身模型选择，可显式同步后续主会话进展；只读查看代码，不自动改文件、干预或追加主会话指令。
