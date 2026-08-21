const express = require("express");
const path = require("path");

const errorMiddleware = require("./middlewares/error.middleware");
const logger = require("./config/logger");

const app = express();

app.set("trust proxy", true);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = process.hrtime();

  // Lấy địa chỉ IP của Client (hỗ trợ cả Proxy/Nginx/Docker và LAN)
  const forwarded = req.headers["x-forwarded-for"];
  let clientIp = forwarded
    ? forwarded.split(",")[0].trim()
    : req.ip || req.socket?.remoteAddress || "";
  clientIp = clientIp.replace(/^::ffff:/, "");
  if (clientIp === "::1") clientIp = "127.0.0.1";

  res.on("finish", () => {
    const diff = process.hrtime(start);
    const time = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(4); // Đổi ra mili-giây
    logger.info(
      `[${clientIp || "unknown"}] HTTP ${req.method} ${req.url} responded ${res.statusCode} in ${time} ms`,
    );
  });
  next();
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "../public")));

// Import Routes
const viewRoutes = require("./routes/viewRoutes");
const apiRoutes = require("./routes/apiRoutes");

// Mount Routes
app.use("/", viewRoutes);
app.use("/api", apiRoutes);

// Error Handling Middleware
app.use(errorMiddleware);

module.exports = app;
