export function adapter(sqlite) {
  return {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...args) || null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...args) };
        },
        run() {
          return sqlite.prepare(sql).run(...args);
        },
      };
    },
    async batch(queries) {
      sqlite.exec("BEGIN");
      try {
        const result = [];
        for (const query of queries) result.push(query.run());
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
