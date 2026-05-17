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
};

type AnalyzedFile = {
  filename: string;
  content: string;
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

  // Grafik State'leri
  const [activeTab, setActiveTab] = useState<"dashboard" | "commit">("dashboard");
  const [timelineData, setTimelineData] = useState<any[]>([]);
  const [errorData, setErrorData] = useState<any[]>([]);
  const [avgRepoScore, setAvgRepoScore] = useState<number>(100);

  const fetchNetflixCommits = async (targetRepo: string) => {
    const response = await axios.get(`${GITHUB_API}/repos/${targetRepo}/commits`, {
      params: { per_page: 10 }
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

        // Toplu Analiz İsteği (Grafikleri Doldurmak İçin)
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

  // Tekil Analiz Butonu
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
          files: realFiles,
        }),
      });

      const raw = await response.json();
      
      setAnalysis({
        score: raw.score,
        riskLevel: raw.risk.toLowerCase() as any,
        findings: raw.findings,
        foundSecret: raw.foundSecret,
      });
      setScore(raw.score);
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
      <div style={{ marginTop: 8, borderRadius: 6, backgroundColor: "#f3f2f1", padding: 8, fontFamily: "Consolas, monospace", fontSize: 11, maxHeight: 150, overflow: "auto" }}>
        {lines.map((rawLine, index) => {
          const line = rawLine.replace(/\t/g, "  ");
          const isAddition = line.startsWith("+");
          const isRemoval = line.startsWith("-");
          
          let bgColor = "transparent";
          if (isAddition) bgColor = "#e6ffed";
          if (isRemoval) bgColor = "#ffeef0";

          return (
            <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: 8, backgroundColor: bgColor }}>
              <span style={{ width: 24, textAlign: "right", color: "#605e5c", userSelect: "none" }}>{index + 1}</span>
              <pre style={{ margin: 0, padding: "0 4px", whiteSpace: "pre-wrap", wordBreak: "break-word", flex: 1 }}>{line}</pre>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "Segoe UI, sans-serif", minHeight: "100vh", background: "linear-gradient(135deg, #f3f2f1 0%, #e5e7fb 30%, #f3f2f1 100%)", display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: 1000, boxSizing: "border-box" }}>
        
        {/* Üst Bar */}
        <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#111" }}>CodePulse</h1>
            <p style={{ margin: 0, color: "#605e5c", fontSize: 13 }}>Netflix Code Quality Analyzer</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "#605e5c" }}>Branch</label>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid #c8c6c4", fontSize: 12 }}>
              <option value="main">main</option>
              <option value="master">master</option>
            </select>
          </div>
        </div>

        {/* Ana Kart */}
        <div style={{ backgroundColor: "#ffffff", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.06)", padding: 24, boxSizing: "border-box" }}>
          
          {/* Repo Seçimi ve Genel Durum */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, borderBottom: "1px solid #e1dfdd", paddingBottom: 16 }}>
            <div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 13 }}>Repository</label>
              <select value={repo} onChange={(e) => setRepo(e.target.value)} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #c8c6c4", minWidth: 260, fontSize: 13 }}>
                <option value="Netflix/Hystrix">Netflix / Hystrix</option>
                <option value="Netflix/zuul">Netflix / Zuul</option>
                <option value="Netflix/falcor">Netflix / Falcor</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
              <div style={{ padding: "6px 14px", borderRadius: 999, backgroundColor: "#f3f2f1" }}>Branş: <strong>{branch}</strong></div>
              <div style={{ padding: "6px 14px", borderRadius: 999, backgroundColor: getScoreColor(avgRepoScore) + "22", color: getScoreColor(avgRepoScore) }}>Repo Genel Kalite Ortalaması: <strong>%{avgRepoScore}</strong></div>
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

          {/* SEKME 1: GRAFİKLER PANELI */}
          {activeTab === "dashboard" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 10 }}>
              <div style={{ border: "1px solid #e1dfdd", borderRadius: 10, padding: 16, backgroundColor: "#faf9f8" }}>
                <h4 style={{ marginTop: 0, marginBottom: 16 }}>Zamana Göre Kalite Skoru Trendi</h4>
                <div style={{ width: '100%', height: 260, display: "flex", justifyContent: "center" }}>
                  <LineChart width={440} height={250} data={timelineData} margin={{ top: 10, right: 20, bottom: 5, left: -20 }}>
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
                <div style={{ width: '100%', height: 260, display: "flex", justifyContent: "center" }}>
                  <BarChart width={440} height={250} data={errorData} margin={{ top: 10, right: 10, bottom: 5, left: -25 }}>
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

          {/* SEKME 2: DÜZELTİLMİŞ VE SABİTLENMİŞ MEVCUT YAN YANA YAPI */}
          {activeTab === "commit" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
              {/* Sol: Commit Listesi */}
              <div style={{ minWidth: 0 }}>
                <h3 style={{ marginTop: 0, fontSize: 15, fontWeight: 600, marginBottom: 12 }}>İncelemek İçin Bir Commit Seçin</h3>
                {isLoadingCommits ? <p>Yükleniyor...</p> : (
                  <div style={{ border: "1px solid #e1dfdd", borderRadius: 10, overflow: "hidden", maxHeight: 480, overflowY: "auto" }}>
                    {commits.map((commit) => (
                      <button key={commit.fullSha} onClick={() => setSelectedCommit(commit)} style={{ width: "100%", textAlign: "left", padding: 12, border: "none", borderBottom: "1px solid #e1dfdd", backgroundColor: selectedCommit?.fullSha === commit.fullSha ? "#e5f1fb" : "#ffffff", cursor: "pointer", boxSizing: "border-box" }}>
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

              {/* Sağ: Analiz Paneli */}
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

                      <div style={{ fontSize: 13, marginBottom: 12, borderTop: "1px solid #e1dfdd", paddingTop: 12 }}>
                        Risk seviyesi: <span style={{ fontWeight: 600, color: getScoreColor(score), backgroundColor: getScoreColor(score) + "15", padding: "2px 8px", borderRadius: 4 }}>{getRiskLabel(analysis?.riskLevel)}</span>
                      </div>

                      <div style={{ fontSize: 13, marginBottom: 16 }}>
                        <strong style={{ display: "block", marginBottom: 6 }}>Bulgular:</strong>
                        <ul style={{ paddingLeft: 16, marginTop: 0, color: "#201f1e" }}>
                          {analysis?.findings.map((f, i) => <li key={i} style={{ marginBottom: 4 }}>{f}</li>)}
                        </ul>
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