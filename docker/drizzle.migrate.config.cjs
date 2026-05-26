/** @type {import("drizzle-kit").Config} */
module.exports = {
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
};
