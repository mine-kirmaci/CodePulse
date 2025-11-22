import React, { useState } from "react";

type Commit = {
  id: string;
  message: string;
  author: string;
  date: string;
};

type AnalysisResult = {
  score: number;
  riskLevel: "low" | "medium" | "high";
  findings: string[];
  foundSecret: boolean;
};

type AnalyzedFile = {
  filename: string;
  content: string;
};

const dummyCommits: Commit[] = [
  {
    id: "7e589bc",
    message: "Update README",
    author: "Jane Smith",
    date: "2 saat önce",
  },
  {
    id: "1a2b3c4",
    message: "Fix bug in authentication",
    author: "John Doe",
    date: "31 Mar 2024",
  },
  {
    id: "f9c8d1e",
    message: "Initial commit",
    author: "John Doe",
    date: "30 Mar 2024",
  },
];

// Seçilen commit'e göre demo dosya içerikleri üret
const getDemoFilesForCommit = (commit: Commit): AnalyzedFile[] => {
  if (commit.message.toLowerCase().includes("auth")) {
    return [
      {
        filename: "auth.service.ts",
        content: `
          // FIXME: geçici çözüm
          const password = "1234";
          console.log("Auth debug log");
        `,
      },
    ];
  }

  if (commit.message.toLowerCase().includes("readme")) {
    return [
      {
        filename: "README.md",
        content: `
          # Proje Dokümantasyonu
          Bu commit sadece dokümantasyon güncellemesi içerir.
        `,
      },
    ];
  }

  // Default senaryo
  return [
    {
      filename: "index.ts",
      content: `
        // TODO: error handling eklenecek
        function main() {
          console.log("Debug için log");
        }
      `,
    },
    {
      filename: "config.ts",
      content: `
        const apiKey = "SECRET_API_KEY_XXX";
      `,
    },
  ];
};

const App: React.FC = () => {
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>("main");
  const [score, setScore] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Seçili commit'e ait demo dosyalar (code viewer'da göstereceğiz)
  const [demoFiles, setDemoFiles] = useState<AnalyzedFile[]>([]);

  const handleAnalyze = async () => {
    if (!selectedCommit) return;

    setIsAnalyzing(true);
    setAnalysis(null);

    // Seçili commit'e göre demo dosyaları üret
    const filesToAnalyze = getDemoFilesForCommit(selectedCommit);

    try {
      const response = await fetch("http://localhost:4000/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          commitMessage: selectedCommit.message,
          files: filesToAnalyze,
        }),
      });

      if (!response.ok) {
        throw new Error("API error");
      }

      const raw = (await response.json()) as {
        score: number;
        risk: "LOW" | "MEDIUM" | "HIGH";
        findings: string[];
        foundSecret: boolean;
      };

      const riskLevel: AnalysisResult["riskLevel"] =
        raw.risk === "LOW"
          ? "low"
          : raw.risk === "MEDIUM"
          ? "medium"
          : "high";

      const analysisResult: AnalysisResult = {
        score: raw.score,
        riskLevel,
        findings: raw.findings,
        foundSecret: raw.foundSecret,
      };

      setScore(analysisResult.score);
      setAnalysis(analysisResult);
    } catch (err) {
      console.error(err);
      setScore(null);
      setAnalysis({
        score: 0,
        riskLevel: "high",
        findings: ["Analiz servisine ulaşılamadı."],
        foundSecret: false,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getScoreColor = () => {
    if (score === null) return "#605e5c";
    if (score >= 80) return "#1a8f3b";
    if (score >= 60) return "#e0a800";
    return "#c53030";
  };

  const getScoreLabel = () => {
    if (score === null) return "Henüz analiz yok";
    if (score >= 80) return "Güvenli / yüksek kalite commit";
    if (score >= 60) return "Orta seviye, iyileştirilebilir";
    return "Riskli commit";
  };

  // satır renklendirme
  const getLineColor = (line: string) => {
    const secretRegex = /(api[_-]?key|token|secret|password)/i;
    const todoRegex = /(TODO|FIXME)/i;
    const debugRegex = /(console\.log|debugger)/i;

    if (secretRegex.test(line)) {
      return "#fde7e9"; // kırmızı
    }

    if (todoRegex.test(line) || debugRegex.test(line)) {
      return "#fff4ce"; // sarı
    }

    return "transparent"; // temiz
  };

  // code viewer
  const renderFileContent = (file: AnalyzedFile) => {
    const lines = file.content.split("\n");

    return (
      <div
        style={{
          marginTop: 8,
          borderRadius: 6,
          backgroundColor: "#f3f2f1",
          padding: 8,
          fontFamily: "Consolas, monospace",
          fontSize: 11,
          maxHeight: 180,
          overflow: "auto",
        }}
      >
        {lines.map((rawLine, index) => {
          const line = rawLine.replace(/\t/g, "  ");

          return (
            <div
              key={index}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 28,
                  textAlign: "right",
                  color: "#605e5c",
                  userSelect: "none",
                }}
              >
                {index + 1}
              </span>
              <pre
                style={{
                  margin: 0,
                  padding: "0 4px",
                  backgroundColor: getLineColor(line),
                  borderRadius: 4,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  flex: 1,
                }}
              >
                {line}
              </pre>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      style={{
        fontFamily: "Segoe UI, system-ui, sans-serif",
        minHeight: "100vh",
        margin: 0,
        background:
          "linear-gradient(135deg, #f3f2f1 0%, #e5e7fb 30%, #f3f2f1 100%)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Ortalanmış shell */}
      <div
        style={{
          width: "100%",
          maxWidth: 960,
          padding: "0 12px",
        }}
      >
        {/* Üst bar */}
        <div
          style={{
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h1 style={{ margin: "4px 0 0 0", fontSize: 26 }}>CodePulse</h1>
            <p
              style={{
                margin: "2px 0 0 0",
                color: "#605e5c",
                fontSize: 13,
              }}
            >
              Azure DevOps commit analiz eklentisi · React + TypeScript (demo)
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label
              htmlFor="branch"
              style={{ fontSize: 11, color: "#605e5c", marginLeft: 2 }}
            >
              Branch
            </label>
            <select
              id="branch"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid #c8c6c4",
                fontSize: 12,
                backgroundColor: "#faf9f8",
              }}
            >
              <option value="main">main</option>
              <option value="dev">dev</option>
              <option value="feature/login">feature/login</option>
            </select>
          </div>
        </div>

        {/* Ana kart */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            padding: "20px 24px 24px 24px",
          }}
        >
          {/* Üst satır: repo + özetler */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: 20,
              borderBottom: "1px solid #e1dfdd",
              paddingBottom: 12,
            }}
          >
            <div>
              <label
                htmlFor="repo"
                style={{
                  display: "block",
                  marginBottom: 6,
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Repository
              </label>
              <select
                id="repo"
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #c8c6c4",
                  minWidth: 260,
                  fontSize: 13,
                  backgroundColor: "#faf9f8",
                }}
                defaultValue="example-repo"
              >
                <option value="example-repo">example-repo (demo)</option>
              </select>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                fontSize: 12,
                color: "#605e5c",
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  backgroundColor: "#f3f2f1",
                }}
              >
                Aktif branch: <strong>{selectedBranch}</strong>
              </div>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  backgroundColor: "#f3f2f1",
                }}
              >
                Son analiz:{" "}
                <strong>{score !== null ? `%${score}` : "Henüz yok"}</strong>
              </div>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  backgroundColor: "#f3f2f1",
                }}
              >
                Seçili commit:{" "}
                <strong>
                  {selectedCommit ? selectedCommit.id : "Seçilmedi"}
                </strong>
              </div>
            </div>
          </div>

          {/* Ana grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 1.1fr",
              gap: 24,
            }}
          >
            {/* Commit listesi */}
            <section>
              <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 16 }}>
                Commit Listesi
              </h3>
              <p
                style={{
                  marginTop: 0,
                  marginBottom: 8,
                  fontSize: 12,
                  color: "#605e5c",
                }}
              >
                Azure DevOps’tan gelecek commit listesinin demo versiyonu.
              </p>
              <div
                style={{
                  border: "1px solid #e1dfdd",
                  borderRadius: 10,
                  overflow: "hidden",
                  backgroundColor: "#faf9f8",
                }}
              >
                {dummyCommits.map((commit, index) => (
                  <button
                    key={commit.id}
                    onClick={() => {
                      setSelectedCommit(commit);
                      setScore(null);
                      setAnalysis(null);
                      setDemoFiles(getDemoFilesForCommit(commit));
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 16px",
                      border: "none",
                      borderBottom:
                        index === dummyCommits.length - 1
                          ? "none"
                          : "1px solid #e1dfdd",
                      backgroundColor:
                        selectedCommit?.id === commit.id
                          ? "#e5f1fb"
                          : "#ffffff",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          fontFamily: "Consolas, monospace",
                          fontSize: 12,
                        }}
                      >
                        {commit.id}
                      </span>
                      <span style={{ fontSize: 11, color: "#605e5c" }}>
                        {commit.date}
                      </span>
                    </div>
                    <div style={{ marginTop: 4 }}>{commit.message}</div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#605e5c",
                        marginTop: 4,
                      }}
                    >
                      {commit.author}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Analiz alanı */}
            <section>
              <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 16 }}>
                Analiz Sonucu
              </h3>
              <div
                style={{
                  border: "1px solid #e1dfdd",
                  borderRadius: 10,
                  padding: 16,
                  backgroundColor: "#faf9f8",
                  minHeight: 220,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <p
                    style={{
                      marginTop: 0,
                      marginBottom: 12,
                      fontSize: 13,
                      color: "#605e5c",
                    }}
                  >
                    Önce listeden bir commit seç, sonra{" "}
                    <strong>Analizi Başlat</strong> butonuna tıkla.
                  </p>

                  <button
                    onClick={handleAnalyze}
                    disabled={!selectedCommit || isAnalyzing}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      border: "none",
                      backgroundColor:
                        !selectedCommit || isAnalyzing ? "#c8c6c4" : "#0078d4",
                      color: "white",
                      cursor:
                        !selectedCommit || isAnalyzing ? "default" : "pointer",
                      marginBottom: 16,
                      fontSize: 13,
                    }}
                  >
                    {isAnalyzing ? "Analiz yapılıyor..." : "Analizi Başlat"}
                  </button>

                  <div>
                    <div
                      style={{
                        fontSize: 34,
                        fontWeight: 700,
                        color: getScoreColor(),
                        lineHeight: 1.1,
                      }}
                    >
                      {score !== null ? `%${score}` : "--"}
                    </div>
                    <div
                      style={{
                        color: "#605e5c",
                        marginTop: 4,
                        fontSize: 13,
                      }}
                    >
                      {getScoreLabel()}
                    </div>

                    {/* Detaylı analiz paneli */}
                    {analysis && (
                      <div
                        style={{
                          marginTop: 16,
                          padding: 12,
                          borderRadius: 8,
                          backgroundColor: "#ffffff",
                          border: "1px solid #e1dfdd",
                          fontSize: 12,
                        }}
                      >
                        {/* Risk seviyesi badge */}
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 8,
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>Risk seviyesi:</span>
                          <span
                            style={{
                              padding: "4px 10px",
                              borderRadius: 999,
                              backgroundColor:
                                analysis.riskLevel === "low"
                                  ? "#dff6dd"
                                  : analysis.riskLevel === "medium"
                                  ? "#fff4ce"
                                  : "#fde7e9",
                              color:
                                analysis.riskLevel === "low"
                                  ? "#107c10"
                                  : analysis.riskLevel === "medium"
                                  ? "#986f0b"
                                  : "#a4262c",
                              fontWeight: 600,
                            }}
                          >
                            {analysis.riskLevel === "low"
                              ? "Düşük"
                              : analysis.riskLevel === "medium"
                              ? "Orta"
                              : "Yüksek"}
                          </span>
                        </div>

                        {/* Bulgular */}
                        <div style={{ marginBottom: 8 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              marginBottom: 4,
                            }}
                          >
                            Bulgular
                          </div>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {analysis.findings.map((f, idx) => (
                              <li key={idx} style={{ marginBottom: 2 }}>
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Secret uyarısı */}
                        {analysis.foundSecret && (
                          <div
                            style={{
                              marginTop: 8,
                              padding: 8,
                              borderRadius: 6,
                              backgroundColor: "#fde7e9",
                              color: "#a4262c",
                              fontWeight: 600,
                            }}
                          >
                            ⚠️ Commit içinde gizli bilgiye benzeyen içerik
                            tespit edildi!
                          </div>
                        )}

                        {/* İncelenen dosyalar – Code Viewer */}
                        {demoFiles.length > 0 && (
                          <div
                            style={{
                              marginTop: 12,
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 600,
                                marginBottom: 4,
                              }}
                            >
                              İncelenen dosyalar
                            </div>
                            <p
                              style={{
                                marginTop: 0,
                                marginBottom: 6,
                                fontSize: 11,
                                color: "#605e5c",
                              }}
                            >
                              🔴 Kırmızı: gizli bilgi riski · 🟡 Sarı: TODO /
                              debug · ⚪ Temiz satırlar
                            </p>

                            {demoFiles.map((file) => (
                              <div key={file.filename} style={{ marginTop: 8 }}>
                                <div
                                  style={{
                                    fontWeight: 600,
                                    fontSize: 11,
                                    marginBottom: 2,
                                  }}
                                >
                                  {file.filename}
                                </div>
                                {renderFileContent(file)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    fontSize: 11,
                    color: "#605e5c",
                    marginTop: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span>Skor açıklaması:</span>
                  <span>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: "#1a8f3b",
                        marginRight: 4,
                      }}
                    />
                    80–100: Güvenli
                  </span>
                  <span>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: "#e0a800",
                        marginRight: 4,
                      }}
                    />
                    60–79: Orta
                  </span>
                  <span>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: "#c53030",
                        marginRight: 4,
                      }}
                    />
                    0–59: Riskli
                  </span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
