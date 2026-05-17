const express = require("express");
const cors = require("cors");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

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

  // 3) Dosya içeriklerinden analiz
  const secretRegex = /(api[_-]?key|token|secret|password)\s*[:=]/i;
  const debugRegex = /(console\.log|debugger)/i;
  const todoRegex = /(TODO|FIXME)/i;

  let foundSecret = false;
  let foundDebug = false;
  let foundTodo = false;
  let totalLines = 0;

  files.forEach((f) => {
    const content = f.content || "";
    const lines = content.split("\n").length;
    totalLines += lines;

    if (secretRegex.test(content)) {
      foundSecret = true;
      findings.push(
        `Dosya '${f.filename}' içinde gizli bilgiye benzeyen bir ifade bulundu.`
      );
    }

    if (debugRegex.test(content)) {
      foundDebug = true;
      findings.push(
        `Dosya '${f.filename}' içinde debug ifadesi (console.log / debugger) kullanılmış.`
      );
    }

    if (todoRegex.test(content)) {
      foundTodo = true;
      findings.push(
        `Dosya '${f.filename}' içinde TODO / FIXME notları bırakılmış.`
      );
    }
  });

  // Secret bulunduysa ciddi puan kır
  if (foundSecret) {
    score -= 50;
  }

  // Debug kullanımı için puan kır
  if (foundDebug) {
    score -= 10;
  }

  // TODO / FIXME için puan kır
  if (foundTodo) {
    score -= 5;
  }

  // Çok büyük commit ise uyar
  if (totalLines > 200) {
    score -= 10;
    findings.push(
      `Commit çok büyük görünüyor (toplam ~${totalLines} satır değişiklik). Daha küçük commit'lere bölmeyi düşünebilirsin.`
    );
  }

  // Skor sınırlandırma
  if (score < 0) score = 0;
  if (score > 100) score = 100;

  const risk = score >= 80 ? "LOW" : score >= 60 ? "MEDIUM" : "HIGH";

  res.json({
    score,
    risk,
    findings,
    foundSecret,
  });
});

// TOPLU COMMIT ANALİZİ ENDPOINT'İ (Grafikler İçin)
app.post("/analyze-bulk", (req, res) => {
  const { commits = [] } = req.body;

  let totalScore = 0;
  let issueCounts = {
    shortMessage: 0,
    conventionalMissing: 0,
    secrets: 0,
    debugs: 0,
    todos: 0,
    bigCommits: 0
  };

  // Her bir commit'i tek tek simüle veya analiz ediyoruz
  const timelineData = commits.map((c, index) => {
    let score = 100;
    const message = c.message || "";

    if (message.trim().length < 5) {
      score -= 40;
      issueCounts.shortMessage++;
    }

    const hasPrefix = message.startsWith("feat") || message.startsWith("fix") || message.startsWith("refactor");
    if (!hasPrefix) {
      score -= 25;
      issueCounts.conventionalMissing++;
    }

    // Gerçek projede burası dinamik dosya analiziyle birleşebilir, 
    // şimdilik grafik akışı için commit mesajı bazlı örnek eşleşmeler de ekleyelim
    if (/(api[_-]?key|token|secret|password)/i.test(message)) {
      score -= 50;
      issueCounts.secrets++;
    }
    if (/(console\.log|debugger)/i.test(message)) {
      score -= 10;
      issueCounts.debugs++;
    }
    if (/(TODO|FIXME)/i.test(message)) {
      score -= 5;
      issueCounts.todos++;
    }

    if (score < 0) score = 0;
    totalScore += score;

    return {
      name: c.id,          // Grafik x-ekseninde görünecek kısa SHA (örn: 5ee3bc5)
      "Kalite Skoru": score,
      date: c.date
    };
  });

  const averageScore = commits.length > 0 ? Math.round(totalScore / commits.length) : 100;

  // Grafiklerin anlayacağı formatta hata dağılımı dizisi oluşturuyoruz
  const errorDistribution = [
    { name: "Kısa Mesaj", Sayı: issueCounts.shortMessage },
    { name: "Format Eksik", Sayı: issueCounts.conventionalMissing },
    { name: "Sızan Veri (Secret)", Sayı: issueCounts.secrets },
    { name: "Debug (Log)", Sayı: issueCounts.debugs },
    { name: "TODO / FIXME", Sayı: issueCounts.todos }
  ];

  res.json({
    averageScore,
    timelineData: timelineData.reverse(), // Zaman akışını kronolojik yapmak için ters çeviriyoruz
    errorDistribution
  });
});

// Sunucuyu başlat
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`✅ CodePulse API ${PORT} portunda çalışıyor`);
});
