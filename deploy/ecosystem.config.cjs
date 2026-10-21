// Cloudways custom Node application. The nginx reverse proxy points to 127.0.0.1:4317.
module.exports={apps:[{name:'bluekite-biz',script:'server/serve.mjs',instances:1,exec_mode:'fork',autorestart:true,max_memory_restart:'256M',env:{NODE_ENV:'production',PORT:'4317',PUBLIC_ORIGIN:'https://biz.bluekite.co.kr',BIZ_DATA_DIR:process.env.BIZ_DATA_DIR}}]};
