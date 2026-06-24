// SQLite 适配层:
//  - 优先使用 Node 内置 node:sqlite(零依赖,用于 npm run dev 与测试);
//  - 当内置不可用时(如 Electron 打包内的旧版 Node)回退到 better-sqlite3。
// 两者的 DatabaseSync / Database 在本项目所用的 API(exec / prepare().run|get|all / close)上兼容,
// 因此无需包装即可直接返回。better-sqlite3 仅在桌面端构建中安装。

// 打开(或新建)一个 SQLite 数据库连接。
// filePath: 数据库文件路径;pragma: 可选,打开后立即执行的 PRAGMA 语句串(如 WAL、外键开关)。
export async function openDatabase(filePath, pragma = "") {
  let db; // 最终返回的数据库句柄,两种实现二选一。
  try {
    // 首选:Node 22+ 内置的同步 SQLite 实现,零第三方依赖。
    const { DatabaseSync } = await import("node:sqlite");
    db = new DatabaseSync(filePath); // 以同步方式打开,API 与 better-sqlite3 一致。
  } catch (nodeSqliteUnavailable) {
    // 回退:内置模块缺失时(打包环境)动态加载 better-sqlite3。
    const { default: Database } = await import("better-sqlite3");
    db = new Database(filePath); // 同样得到 exec/prepare 接口的句柄。
  }
  if (pragma) db.exec(pragma); // 有 PRAGMA 配置时立即应用(如 journal_mode=WAL)。
  return db; // 交回调用方(server.mjs)用于建表与读写。
}
