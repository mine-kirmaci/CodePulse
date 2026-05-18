import React, { useState, useEffect } from "react";
import axios from 'axios';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts';

const GITHUB_API = "https://api.github.com";

type Commit = {
  id: string;
  fullSha: string;
  message: string;
  author: string;
  date: string;
};

type AnalysisResult = {
  score: number;
  riskLevel: "low" | "medium" | "high";
  findings: string[];
  foundSecret: boolean;
  reports?: { kategori: string; detay: string }[];
};

type AnalyzedFile = {
  filename: string;
  content: string;
};

type WebhookLog = {
  timestamp: string;
  commitId: string;
  status: "success" | "failure";
  detail: string;
};

const App: React.FC = () => {
  const [repo, setRepo] = useState("Netflix/Hystrix");
  const [branch, setBranch] = useState("main");
  const [commits, setCommits] = useState<Commit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingCommits, setIsLoadingCommits] = useState(false);
  const [demoFiles, setDemoFiles] = useState<AnalyzedFile[]>([]);

  // --- SLACK WEBHOOK ADRESİNİZ ARTIK BURADA VARYAYILAN VE AKTİF ---
  const [webhookUrl, setWebhookUrl] = useState("https://hooks.slack.com/services/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");
  const [webhookType, setWebhookType] = useState<"slack" | "discord">("slack");
  const [isWebhookEnabled, setIsWebhookEnabled] = useState(true); 
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [isIntegrationOpen, setIsIntegrationOpen] = useState(true); 

  // Grafik ve Tab State'leri
  const [activeTab, setActiveTab] = useState<"dashboard" | "commit">("dashboard");
  const [timelineData, setTimelineData] = useState<any[]>([]);
  const [errorData, setErrorData] = useState<any[]>([]);
  const [avgRepoScore, setAvgRepoScore] = useState<number>(100);

  const fetchNetflixCommits = async (targetRepo: string) => {
    const response = await axios.get(`${GITHUB_API}/repos/${targetRepo}/commits`, {
      params: { per_page: 20 }
    });
    return response.data;
  };

  const fetchCommitFiles = async (targetRepo: string, sha: string) => {
    const response = await axios.get(`${GITHUB_API}/repos/${targetRepo}/commits/${sha}`);
    return response.data.files.map((file: any) => ({
      filename: file.filename,
      content: file.patch || "// Dosya içeriği çok büyük veya sadece isim değişikliği."
    }));
  };

  // Repo Değişince Verileri Yükle
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoadingCommits(true);
        const rawCommits = await fetchNetflixCommits(repo);
        const formatted = rawCommits.map((item: any) => ({
          id: item.sha.substring(0, 7),
          fullSha: item.sha,
          message: item.commit.message,
          author: item.commit.author.name,
          date: new Date(item.commit.author.date).toLocaleDateString('tr-TR'),
        }));
        setCommits(formatted);
        
        setSelectedCommit(null);
        setScore(null);
        setAnalysis(null);
        setDemoFiles([]);

        const bulkResponse = await fetch("http://localhost:4000/analyze-bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commits: formatted }),
        });
        const bulkData = await bulkResponse.json();
        setTimelineData(bulkData.timelineData);
        setErrorData(bulkData.errorDistribution);
        setAvgRepoScore(bulkData.averageScore);

      } catch (err) {
        console.error("Veri yükleme hatası:", err);
      } finally {
        setIsLoadingCommits(false);
      }
    };
    loadData();
  }, [repo]);

  // --- SEÇİM TETİKLEYİCİSİ: YENİ COMMIT SEÇİLİNCE ESKİ RAPORU SİLER ---
  const handleSelectCommit = (commit: Commit) => {
    setSelectedCommit(commit);
    setScore(null);          
    setAnalysis(null);       
    setDemoFiles([]);        
  };

  // Handle Commit Analysis
  const handleAnalyze = async () => {
    if (!selectedCommit) return;
    setIsAnalyzing(true);
    setAnalysis(null);

    try {
      const realFiles = await fetchCommitFiles(repo, selectedCommit.fullSha);
      setDemoFiles(realFiles); 

      const response = await fetch("http://localhost:4000/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commitMessage: selectedCommit.message,
          commitId: selectedCommit.id,
          files: realFiles,
          webhookConfig: {
            enabled: isWebhookEnabled,
            url: webhookUrl,
            type: webhookType
          }
        }),
      });

      const raw = await response.json();
      
      setAnalysis({
        score: raw.score,
        riskLevel: raw.risk.toLowerCase() as any,
        findings: raw.findings,
        foundSecret: raw.foundSecret,
        reports: raw.reports 
      });
      setScore(raw.score);

      // Grafik verilerini backend'deki yeni skora göre senkronize et
      const bulkResponse = await fetch("http://localhost:4000/analyze-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commits }),
      });
      const bulkData = await bulkResponse.json();
      setTimelineData(bulkData.timelineData);
      setErrorData(bulkData.errorDistribution);
      setAvgRepoScore(bulkData.averageScore);

      if (raw.webhookResult) {
        const newLog: WebhookLog = {
          timestamp: new Date().toLocaleTimeString("tr-TR"),
          commitId: selectedCommit.id,
          status: raw.webhookResult.success ? "success" : "failure",
          detail: raw.webhookResult.message
        };
        setWebhookLogs(prev => [newLog, ...prev]);
      }

    } catch (err) {
      console.error("Analiz hatası:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getScoreColor = (s: number | null) => {
    if (s === null) return "#605e5c";
    if (s >= 80) return "#1a8f3b";
    if (s >= 60) return "#e0a800";
    return "#c53030";
  };

  const getRiskLabel = (level: string | undefined) => {
    if (!level) return "-";
    if (level === "low") return "Düşük";
    if (level === "medium") return "Orta";
    return "Yüksek";
  };

  const renderFileContent = (file: AnalyzedFile) => {
    const lines = file.content.split("\n");
    return (
      <div style={{ marginTop: 8, borderRadius: 6, backgroundColor: "#1e1e1e", color: "#f8f8f2", padding: 12, fontFamily: "Consolas, monospace", fontSize: 11, maxHeight: 160, overflow: "auto", lineHeight: "1.5" }}>
        {lines.map((rawLine, index) => {
          const line = rawLine.replace(/\t/g, "  ");
          const isAddition = line.startsWith("+");
          const isRemoval = line.startsWith("-");
          
          let bgColor = "transparent";
          let textColor = "#f8f8f2";
          if (isAddition) { bgColor = "#143a1e"; textColor = "#a6e22e"; }
          if (isRemoval) { bgColor = "#441515"; textColor = "#f92672"; }

          return (
            <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: 8, backgroundColor: bgColor, color: textColor, width: "100%" }}>
              <span style={{ width: 24, textAlign: "right", color: "#605e5c", userSelect: "none" }}>{index + 1}</span>
              <pre style={{ margin: 0, padding: "0 4px", whiteSpace: "pre-wrap", wordBreak: "break-all", flex: 1, fontFamily: "inherit" }}>{line}</pre>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "Segoe UI, sans-serif", minHeight: "100vh", background: "linear-gradient(135deg, #f3f2f1 0%, #e5e7fb 30%, #f3f2f1 100%)", display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: 1000, boxSizing: "border-box" }}>
        
        {/* Üst Bar (Düzeltilmiş Orijinal Esnek Hizalama) */}
        <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#111" }}>CodePulse</h1>
            <p style={{ margin: 0, color: "#605e5c", fontSize: 13 }}>Netflix Code Quality Analyzer</p>
          </div>
          
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button 
              onClick={() => setIsIntegrationOpen(!isIntegrationOpen)} 
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 999, border: "1px solid #c8c6c4", fontSize: 12, backgroundColor: isWebhookEnabled ? "#e2f9e6" : "#ffffff", cursor: "pointer", fontWeight: 600, color: isWebhookEnabled ? "#1a8f3b" : "#323130", transition: "all 0.2s" }}
            >
              🔌 Webhook {isWebhookEnabled ? "Aktif" : "Entegrasyonu"}
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#605e5c" }}>Branş:</span>
              <select value={branch} onChange={(e) => setBranch(e.target.value)} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid #c8c6c4", fontSize: 12, backgroundColor: "#fff" }}>
                <option value="main">main</option>
                <option value="master">master</option>
              </select>
            </div>
          </div>
        </div>

        {/* Canlı Webhook Entegrasyon Paneli (UI Kaymalarından Tamamen Arındırıldı) */}
        {isIntegrationOpen && (
          <div style={{ backgroundColor: "#ffffff", borderRadius: 10, border: "1px solid #c8c6c4", padding: 16, marginBottom: 16, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <strong style={{ fontSize: 14, color: "#111" }}>🔌 DevOps Canlı Bildirim Entegrasyonu</strong>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                <input type="checkbox" checked={isWebhookEnabled} onChange={(e) => setIsWebhookEnabled(e.target.checked)} />
                Webhook'u Etkinleştir
              </label>
            </div>
            
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <select value={webhookType} onChange={(e: any) => setWebhookType(e.target.value)} style={{ padding: "8px", borderRadius: 6, border: "1px solid #c8c6c4", fontSize: 12, backgroundColor: "#fff", width: "120px" }}>
                <option value="slack">Slack</option>
                <option value="discord">Discord</option>
              </select>
              <input 
                type="text" 
                placeholder="Slack Webhook URL'inizi buraya yapıştırın..." 
                value={webhookUrl} 
                onChange={(e) => setWebhookUrl(e.target.value)} 
                style={{ padding: "8px", borderRadius: 6, border: "1px solid #c8c6c4", fontSize: 12, flex: 1, boxSizing: "border-box", fontMono: "monospace" }}
              />
            </div>

            {/* Entegrasyon Canlı Akış Günlüğü */}
            {webhookLogs.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed #e1dfdd" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#605e5c", display: "block", marginBottom: 6 }}>📡 Canlı Entegrasyon Akışı (Logs)</span>
                <div style={{ maxHeight: 80, overflowY: "auto", fontSize: 11, fontFamily: "monospace", display: "flex", flexDirection: "column", gap: 4 }}>
                  {webhookLogs.map((log, index) => (
                    <div key={index} style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", borderRadius: 4, backgroundColor: log.status === "success" ? "#e6ffed" : "#ffeef0", color: log.status === "success" ? "#1a8f3b" : "#c53030" }}>
                      <span>[{log.timestamp}] Commit: {log.commitId} &rarr; {log.detail}</span>
                      <strong style={{ whiteSpace: "nowrap" }}>{log.status === "success" ? "BAŞARILI" : "HATA"}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Ana Kart */}
        <div style={{ backgroundColor: "#ffffff", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.06)", padding: 24, boxSizing: "border-box" }}>
          
          {/* Repo Seçimi ve Genel Durum Barı (Genişlik Sabitlendi) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, borderBottom: "1px solid #e1dfdd", paddingBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 13 }}>Repository</label>
              <select value={repo} onChange={(e) => setRepo(e.target.value)} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #c8c6c4", minWidth: 260, fontSize: 13, backgroundColor: "#fff" }}>
                <option value="Netflix/Hystrix">Netflix / Hystrix</option>
                <option value="Netflix/zuul">Netflix / Zuul</option>
                <option value="Netflix/falcor">Netflix / Falcor</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 12, alignItems: "center" }}>
              <div style={{ padding: "6px 14px", borderRadius: 999, backgroundColor: "#f3f2f1", fontWeight: 600 }}>Branş: <strong>{branch}</strong></div>
              <div style={{ padding: "6px 14px", borderRadius: 999, backgroundColor: getScoreColor(avgRepoScore) + "22", color: getScoreColor(avgRepoScore), fontWeight: 600, whiteSpace: "nowrap" }}>Repo Genel Kalite Ortalaması: <strong>%{avgRepoScore}</strong></div>
            </div>
          </div>

          {/* Sekme Menüsü */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <button onClick={() => setActiveTab("dashboard")} style={{ padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 600, backgroundColor: activeTab === "dashboard" ? "#0078d4" : "#f3f2f1", color: activeTab === "dashboard" ? "white" : "#323130" }}>
              📊 Genel Rapor & Grafikler
            </button>
            <button onClick={() => setActiveTab("commit")} style={{ padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 600, backgroundColor: activeTab === "commit" ? "#0078d4" : "#f3f2f1", color: activeTab === "commit" ? "white" : "#323130" }}>
              🔍 Tekil Commit Analizi
            </button>
          </div>

          {/* SEKME 1: GENEL GRAFİKLER PANELI */}
          {activeTab === "dashboard" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 10 }}>
              <div style={{ border: "1px solid #e1dfdd", borderRadius: 10, padding: 16, backgroundColor: "#faf9f8" }}>
                <h4 style={{ marginTop: 0, marginBottom: 16, fontStyle: "normal" }}>Zamana Göre Kalite Skoru Trendi</h4>
                <div style={{ width: '100%', height: 250, display: "flex", justifyContent: "center" }}>
                  <LineChart width={440} height={240} data={timelineData} margin={{ top: 10, right: 20, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="#605e5c" style={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} stroke="#605e5c" style={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="Kalite Skoru" stroke="#0078d4" strokeWidth={3} activeDot={{ r: 6 }} />
                  </LineChart>
                </div>
              </div>

              <div style={{ border: "1px solid #e1dfdd", borderRadius: 10, padding: 16, backgroundColor: "#faf9f8" }}>
                <h4 style={{ marginTop: 0, marginBottom: 16 }}>Tespit Edilen Sorun Dağılımı</h4>
                <div style={{ width: '100%', height: 250, display: "flex", justifyContent: "center" }}>
                  <BarChart width={440} height={240} data={errorData} margin={{ top: 10, right: 10, bottom: 5, left: -25 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="#605e5c" style={{ fontSize: 10 }} />
                    <YAxis stroke="#605e5c" style={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="Sayı" fill="#c53030" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </div>
              </div>
            </div>
          )}

          {/* SEKME 2: TEKİL COMMIT DETAY PANELI */}
          {activeTab === "commit" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
              {/* Sol: Commit Listesi */}
              <div style={{ minWidth: 0 }}>
                <h3 style={{ marginTop: 0, fontSize: 15, fontWeight: 600, marginBottom: 12 }}>İncelemek İçin Bir Commit Seçin</h3>
                {isLoadingCommits ? <p>Yükleniyor...</p> : (
                  <div style={{ border: "1px solid #e1dfdd", borderRadius: 10, overflow: "hidden", maxHeight: 480, overflowY: "auto" }}>
                    {commits.map((commit) => (
                      <button key={commit.fullSha} onClick={() => handleSelectCommit(commit)} style={{ width: "100%", textAlign: "left", padding: 12, border: "none", borderBottom: "1px solid #e1dfdd", backgroundColor: selectedCommit?.fullSha === commit.fullSha ? "#e5f1fb" : "#ffffff", cursor: "pointer", boxSizing: "border-box" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                          <span style={{ fontWeight: 600, color: "#0078d4" }}>{commit.id}</span>
                          <span>{commit.date}</span>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{commit.message}</div>
                        <div style={{ fontSize: 11, color: "#605e5c", marginTop: 4 }}>👤 {commit.author}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sağ: Rapor Detay Paneli */}
              <div style={{ minWidth: 0 }}>
                <h3 style={{ marginTop: 0, fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Analiz Raporu</h3>
                <div style={{ border: "1px solid #e1dfdd", borderRadius: 10, padding: 16, backgroundColor: "#faf9f8", boxSizing: "border-box" }}>
                  <button onClick={handleAnalyze} disabled={!selectedCommit || isAnalyzing} style={{ width: "100%", padding: 10, borderRadius: 6, border: "none", backgroundColor: !selectedCommit || isAnalyzing ? "#c8c6c4" : "#0078d4", color: "white", cursor: "pointer", marginBottom: 16, fontWeight: 600 }}>
                    {isAnalyzing ? "Analiz ediliyor..." : "Seçili Commit'i Analiz Et"}
                  </button>

                  {score === null && !isAnalyzing && (
                    <div style={{ textAlign: "center", padding: "20px 0", color: "#605e5c", fontSize: 13 }}>
                      Önce listeden bir commit seç, sonra Analizi Başlat butonuna tıkla.
                    </div>
                  )}

                  {score !== null && (
                    <>
                      <div style={{ textAlign: 'center', marginBottom: 16 }}>
                        <div style={{ fontSize: 44, fontWeight: 700, color: getScoreColor(score) }}>%{score}</div>
                        <div style={{ fontSize: 12, color: "#605e5c", marginTop: 2 }}>{score >= 80 ? "Güvenli / yüksek kalite" : "Orta seviye, iyileştirilebilir"}</div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, marginBottom: 12, borderTop: "1px solid #e1dfdd", paddingTop: 12 }}>
                        <div>
                          Risk seviyesi: <span style={{ fontWeight: 600, color: getScoreColor(score), backgroundColor: getScoreColor(score) + "15", padding: "2px 8px", borderRadius: 4 }}>{getRiskLabel(analysis?.riskLevel)}</span>
                        </div>
                        {isWebhookEnabled && score < 70 && (
                          <div style={{ fontSize: 11, color: "#1a8f3b", fontWeight: 600, whiteSpace: "nowrap" }}>
                            🚀 Webhook Tetiklendi!
                          </div>
                        )}
                      </div>

                      {/* Bulgular Alanı */}
                      <div style={{ fontSize: 13, marginBottom: 16 }}>
                        <strong style={{ display: "block", marginBottom: 8, color: "#111" }}>Bulgular</strong>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {analysis?.reports && analysis.reports.length > 0 ? (
                            analysis.reports.map((item: any, i: number) => (
                              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "2px 0" }}>
                                <div style={{ color: "#201f1e", fontWeight: 500, display: "flex", alignItems: "start", gap: 6 }}>
                                  <span style={{ color: "#c53030", userSelect: "none" }}>•</span>
                                  <div style={{ lineHeight: "1.4" }}>
                                    <strong>{item.kategori}:</strong>{" "}
                                    <span style={{ color: "#605e5c", fontFamily: "monospace", fontSize: 12, backgroundColor: "#fff", padding: "1px 4px", borderRadius: 3, border: "1px solid #e1dfdd" }}>{item.detay}</span>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div style={{ color: "#1a8f3b", fontWeight: 600 }}>• Kritik bir kural ihlali bulunamadı.</div>
                          )}
                        </div>
                      </div>

                      <div style={{ borderTop: "1px solid #e1dfdd", paddingTop: 12 }}>
                        <strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>İncelenen dosyalar</strong>
                        {demoFiles.map(file => (
                          <div key={file.filename} style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#0078d4", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📄 {file.filename}</div>
                            {renderFileContent(file)}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default App;