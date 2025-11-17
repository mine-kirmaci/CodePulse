const express = require("express");
const cors = require("cors");

//app artık bizim server’ımızdır.
//Bütün endpoint’ler (app.get, app.post…) bunun üzerinde çalışacak.
const app = express();

// Middlewares
app.use(cors()); // Frontend'in backend'e erişmesine izin verir
app.use(express.json()); // Gönderilen JSON verilerini otomatik çözer

// Basit test endpoint'i
app.get("/", (req, res) => {
  res.json({ message: "CodePulse API çalışıyor 🚀" });
});

// Commit analizi endpoint'i
app.post("/analyze", (req, res) => {
  const { commitMessage, files = [] } = req.body;

  let score = 100;
  let findings = [];

  // 1) Commit mesajı çok kısaysa puan kır
  if (!commitMessage || commitMessage.trim().length < 5) {
    score -= 40;
    findings.push("Commit mesajı çok kısa.");
  }

  // 2) Conventional commit prefix yoksa puan kır
  const hasPrefix =
    commitMessage?.startsWith("feat") ||
    commitMessage?.startsWith("fix") ||
    commitMessage?.startsWith("refactor");

  if (!hasPrefix) {
    score -= 25;
    findings.push("Commit mesajı conventional commit formatında değil.");
  }

  // 3) Dosyalarda gizli veri arama (örnek regex)
  const secretRegex = /(api[_-]?key|token|secret|password)\s*[:=]/i;
  let foundSecret = false;

  files.forEach((f) => {
    if (f.content && secretRegex.test(f.content)) {
      foundSecret = true;
    }
  });

  if (foundSecret) {
    score -= 50;
    findings.push("Commit içinde gizli bilgiye benzeyen içerik bulundu.");
  }

  // Skor sınırlandırma
  if (score < 0) score = 0;
  if (score > 100) score = 100;

  const risk =
    score >= 80 ? "LOW" : score >= 60 ? "MEDIUM" : "HIGH";

  res.json({
    score,
    risk,
    findings,
    foundSecret,
  });
});

// Sunucuyu başlat
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`✅ CodePulse API ${PORT} portunda çalışıyor`);
});
