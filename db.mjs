// SQLite 适配层:
//  - 优先使用 Node 内置 node:sqlite(零依赖,用于 npm run dev 与测试);
//  - 当内置不可用时(如 Electron 打包内的旧版 Node)回退到 better-sqlite3。
// 两者的 DatabaseSync / Database 在本项目所用的 API(exec / prepare().run|get|all / close)上兼容,
// 因此无需包装即可直接返回。better-sqlite3 仅在桌面端构建中安装。

export async function openDatabase(filePath, pragma = "") {
  let db;
  try {
    const { DatabaseSync } = await import("node:sqlite");
    db = new DatabaseSync(filePath);
  } catch (nodeSqliteUnavailable) {
    const { default: Database } = await import("better-sqlite3");
    db = new Database(filePath);
  }
  if (pragma) db.exec(pragma);
  return db;
}
