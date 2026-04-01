import React, { useState, useEffect } from "react";
import axios from 'axios';

const GITHUB_API = "https://api.github.com";

// TİP TANIMLAMALARI
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
  // --- 1. STATE TANIMLAMALARI (Bileşen İçinde Olmalı) ---
  const [repo, setRepo] = useState("Netflix/Hystrix");
  const [branch, setBranch] = useState("main");
  const [commits, setCommits] = useState<Commit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingCommits, setIsLoadingCommits] = useState(false); // Eksik olan state
  const [demoFiles, setDemoFiles] = useState<AnalyzedFile[]>([]);

  // --- 2. API FONKSİYONLARI ---
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

  // --- 3. VERİ ÇEKME TETİKLEYİCİSİ (REPO DEĞİŞİNCE ÇALIŞIR) ---
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
        // Repo değişince seçili commit'i temizleyelim ki karışıklık olmasın
        setSelectedCommit(null);
        setScore(null);
        setAnalysis(null);
        setDemoFiles([]);
      } catch (err) {
        console.error("Veri yükleme hatası:", err);
      } finally {
        setIsLoadingCommits(false);
      }
    };
    loadData();
  }, [repo]); // Sadece repo değiştiğinde tetiklenir

  // --- 4. ANALİZ BUTONU ---
  const handleAnalyze = async () => {
    if (!selectedCommit) return;
    setIsAnalyzing(true);
    setAnalysis(null);

    try {
      // Dinamik repo adını da gönderiyoruz
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

  // --- YARDIMCI GÖRSEL FONKSİYONLAR ---
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

  const getLineColor = (line: string) => {
    const secretRegex = /(api[_-]?key|token|secret|password)/i;
    const todoRegex = /(TODO|FIXME)/i;
    const debugRegex = /(console\.log|debugger)/i;
    if (secretRegex.test(line)) return "#fde7e9";
    if (todoRegex.test(line) || debugRegex.test(line)) return "#fff4ce";
    return "transparent";
  };

  const renderFileContent = (file: AnalyzedFile) => {
    const lines = file.content.split("\n");
    return (
      <div style={{ marginTop: 8, borderRadius: 6, backgroundColor: "#f3f2f1", padding: 8, fontFamily: "Consolas, monospace", fontSize: 11, maxHeight: 180, overflow: "auto" }}>
        {lines.map((rawLine, index) => {
          const line = rawLine.replace(/\t/g, "  ");
          return (
            <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ width: 28, textAlign: "right", color: "#605e5c", userSelect: "none" }}>{index + 1}</span>
              <pre style={{ margin: 0, padding: "0 4px", backgroundColor: getLineColor(line), borderRadius: 4, whiteSpace: "pre-wrap", wordBreak: "break-word", flex: 1 }}>{line}</pre>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "Segoe UI, sans-serif", minHeight: "100vh", background: "linear-gradient(135deg, #f3f2f1 0%, #e5e7fb 30%, #f3f2f1 100%)", display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: 960 }}>
        {/* Üst Bar */}
        <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26 }}>CodePulse</h1>
            <p style={{ margin: 0, color: "#605e5c", fontSize: 13 }}>Netflix Code Quality Analyzer</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "#605e5c" }}>Branch</label>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid #c8c6c4", fontSize: 12 }}>
              <option value="master">master</option>
              <option value="main">main</option>
              <option value="candidate">candidate</option>
            </select>
          </div>
        </div>

        {/* Ana Kart */}
        <div style={{ backgroundColor: "#ffffff", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.08)", padding: 24 }}>
          {/* Repo Seçimi ve Özet Bilgiler */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, borderBottom: "1px solid #e1dfdd", paddingBottom: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 13 }}>Repository</label>
              <select value={repo} onChange={(e) => setRepo(e.target.value)} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #c8c6c4", minWidth: 260, fontSize: 13 }}>
                <option value="Netflix/Hystrix">Netflix / Hystrix</option>
                <option value="Netflix/zuul">Netflix / Zuul</option>
                <option value="Netflix/falcor">Netflix / Falcor</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, fontSize: 12, color: "#605e5c" }}>
              <div style={{ padding: "6px 10px", borderRadius: 999, backgroundColor: "#f3f2f1" }}>Branş: <strong>{branch}</strong></div>
              <div style={{ padding: "6px 10px", borderRadius: 999, backgroundColor: "#f3f2f1" }}>Skor: <strong>{score !== null ? `%${score}` : "-"}</strong></div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.1fr", gap: 24 }}>
            {/* Sol: Commit Listesi */}
            <section>
              <h3 style={{ marginTop: 0 }}>Commit Geçmişi</h3>
              {isLoadingCommits ? <p>Yükleniyor...</p> : (
                <div style={{ border: "1px solid #e1dfdd", borderRadius: 10, overflow: "hidden" }}>
                  {commits.map((commit) => (
                    <button key={commit.fullSha} onClick={() => setSelectedCommit(commit)} style={{ width: "100%", textAlign: "left", padding: 12, border: "none", borderBottom: "1px solid #e1dfdd", backgroundColor: selectedCommit?.fullSha === commit.fullSha ? "#e5f1fb" : "#ffffff", cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ fontWeight: 600, color: "#0078d4" }}>{commit.id}</span>
                        <span>{commit.date}</span>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13 }}>{commit.message}</div>
                      <div style={{ fontSize: 11, color: "#605e5c", marginTop: 4 }}>👤 {commit.author}</div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Sağ: Analiz Paneli */}
            <section>
              <h3 style={{ marginTop: 0 }}>Analiz Sonucu</h3>
              <div style={{ border: "1px solid #e1dfdd", borderRadius: 10, padding: 16, backgroundColor: "#faf9f8", minHeight: 220 }}>
                <button onClick={handleAnalyze} disabled={!selectedCommit || isAnalyzing} style={{ width: "100%", padding: 10, borderRadius: 6, border: "none", backgroundColor: !selectedCommit || isAnalyzing ? "#c8c6c4" : "#0078d4", color: "white", cursor: "pointer", marginBottom: 16 }}>
                  {isAnalyzing ? "Analiz ediliyor..." : "Analizi Başlat"}
                </button>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 42, fontWeight: 700, color: getScoreColor() }}>{score !== null ? `%${score}` : "--"}</div>
                  <div style={{ fontSize: 13, color: "#605e5c" }}>{getScoreLabel()}</div>
                </div>

                {analysis && (
                  <div style={{ marginTop: 16, padding: 12, borderRadius: 8, backgroundColor: "#ffffff", border: "1px solid #e1dfdd", fontSize: 12 }}>
                    <strong>Bulgular:</strong>
                    <ul style={{ paddingLeft: 18, marginTop: 4 }}>
                      {analysis.findings.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                    {demoFiles.map(file => (
                      <div key={file.filename} style={{ marginTop: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 11 }}>📄 {file.filename}</div>
                        {renderFileContent(file)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;