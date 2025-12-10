import {useState, useEffect} from "react";
import constants, { buildPresenceChecklist, METRIC_CONFIG } from "../constants.js";

import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function App() {
  const [aiReady, setAiReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [resumeText, setResumeText] = useState("");
  const [presenceChecklist, setPresenceChecklist] = useState([]);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [hoveredMetric, setHoveredMetric] = useState(null);
  const [metricAnimations, setMetricAnimations] = useState({});
  const [resumeInsights, setResumeInsights] = useState(null);

  useEffect(() => {
const interval = setInterval(() => {
      if (window.puter?.ai?.chat) {
        setAiReady(true);
        clearInterval(interval);
      }
    }, 300);
    return () => clearInterval(interval);
  }, []);

  // Animate progress bar when analysis is loaded
  useEffect(() => {
    if (analysis?.overallScore) {
      const scoreValue = parseFloat(analysis.overallScore.split("/")[0] || "7");
      const targetPercentage = (scoreValue / 10) * 100;
      
      // Reset and animate
      setAnimatedScore(0);
      const duration = 1500; // 1.5 seconds
      const steps = 60;
      const increment = targetPercentage / steps;
      const stepDuration = duration / steps;
      
      let currentStep = 0;
      const timer = setInterval(() => {
        currentStep++;
        const newValue = Math.min(increment * currentStep, targetPercentage);
        setAnimatedScore(newValue);
        
        if (currentStep >= steps) {
          clearInterval(timer);
        }
      }, stepDuration);
      
      return () => clearInterval(timer);
    }
  }, [analysis]);

  // Animate performance metrics when analysis is loaded
  useEffect(() => {
    if (analysis?.performanceMetrics) {
      const metrics = analysis.performanceMetrics;
      const initialAnimations = {};
      
      // Initialize all metrics to 0
      METRIC_CONFIG.forEach((config) => {
        initialAnimations[config.key] = 0;
      });
      setMetricAnimations(initialAnimations);
      
      // Animate each metric
      METRIC_CONFIG.forEach((config) => {
        const targetValue = metrics[config.key] || config.defaultValue;
        const duration = 1500;
        const steps = 60;
        const increment = targetValue / steps;
        const stepDuration = duration / steps;
        
        let currentStep = 0;
        const timer = setInterval(() => {
          currentStep++;
          const newValue = Math.min(increment * currentStep, targetValue);
          
          setMetricAnimations((prev) => ({
            ...prev,
            [config.key]: newValue,
          }));
          
          if (currentStep >= steps) {
            clearInterval(timer);
          }
        }, stepDuration);
      });
    }
  }, [analysis]);

  const extractPDFText = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pageTexts = await Promise.all(
      Array.from({ length: pdf.numPages }, (_, i) =>
        pdf
          .getPage(i + 1)
          .then((page) =>
            page
              .getTextContent()
              .then((tc) => tc.items.map((item) => item.str).join(" "))
          )
      )
    );

    return pageTexts.join("\n").trim();
  };

  const extractHighlightedSkills = (text, analysis) => {
    const lowerText = text.toLowerCase();
    
    // Comprehensive list of technical and professional skills
    const allSkills = [
      // Programming Languages
      "javascript", "typescript", "python", "java", "c++", "c#", "go", "rust", "php", "ruby", "swift", "kotlin", "scala",
      // Web Technologies
      "react", "vue", "angular", "next.js", "nuxt.js", "svelte", "html", "css", "sass", "scss", "tailwind", "bootstrap",
      // Backend & Frameworks
      "node.js", "express", "django", "flask", "spring", "laravel", "asp.net", "fastapi", "nest.js",
      // Databases
      "sql", "mysql", "postgresql", "mongodb", "redis", "cassandra", "elasticsearch", "dynamodb", "oracle",
      // Cloud & DevOps
      "aws", "azure", "gcp", "docker", "kubernetes", "jenkins", "terraform", "ansible", "ci/cd", "github actions",
      // Tools & Others
      "git", "graphql", "rest", "api", "microservices", "agile", "scrum", "jira", "confluence",
      // Data & AI
      "machine learning", "deep learning", "tensorflow", "pytorch", "pandas", "numpy", "data analysis",
      // Soft Skills
      "leadership", "communication", "problem solving", "teamwork", "project management", "collaboration"
    ];

    // Extract skills found in resume
    const foundSkills = allSkills.filter(skill => 
      lowerText.includes(skill.toLowerCase())
    );

    // Prioritize skills: use keywords from analysis if available, otherwise use found skills
    let highlightedSkills = [];
    let mainSkills = [];

    if (analysis?.keywords && analysis.keywords.length > 0) {
      // Use analysis keywords as highlighted skills
      highlightedSkills = analysis.keywords
        .filter(kw => foundSkills.some(skill => skill.toLowerCase().includes(kw.toLowerCase()) || kw.toLowerCase().includes(skill.toLowerCase())))
        .slice(0, 8);
      
      // Main skills are the most common technical skills found
      mainSkills = foundSkills
        .filter(skill => !highlightedSkills.some(hs => hs.toLowerCase().includes(skill.toLowerCase())))
        .slice(0, 12);
    } else {
      // If no analysis keywords, prioritize technical skills
      const technicalSkills = foundSkills.filter(skill => 
        !["leadership", "communication", "problem solving", "teamwork", "project management", "collaboration", "agile", "scrum"].includes(skill.toLowerCase())
      );
      
      highlightedSkills = technicalSkills.slice(0, 8);
      mainSkills = foundSkills
        .filter(skill => !highlightedSkills.includes(skill))
        .slice(0, 12);
    }

    return {
      highlighted: highlightedSkills,
      main: mainSkills
    };
  };

  const parseJSONResponse = (reply) => {
    try {
      const match = reply.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : {};
      if (!parsed.overallScore && !parsed.error) {
        throw new Error("Invalid AI response");
      }
      return parsed;
    } catch (err) {
      throw new Error(`Failed to parse AI response: ${err.message}`);
    }
  };

  const analyzeResume = async (pageTexts) => {
    if (!aiReady || !window.puter?.ai?.chat) {
      throw new Error("AI client not ready yet. Please wait a moment.");
    }

    const prompt = constants.ANALYZE_RESUME_PROMPT.replace(
      "{{DOCUMENT_TEXT}}",
      pageTexts
    );
    const response = await window.puter.ai.chat(
      [
        { role: "system", content: "You are an expert resume reviewer." },
        { role: "user", content: prompt },
      ],
      {
        model: "gpt-4o",
      }
    );
    const result = parseJSONResponse(
      typeof response === "string" ? response : response.message?.content || ""
    );
    if (result.error) throw new Error(result.error);
    return result;
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== "application/pdf") {
      return alert("Please upload a PDF file only.");
    }
    setUploadedFile(file);
    setIsLoading(true);
    setAnalysis(null);
    setResumeText("");
    setPresenceChecklist([]);
    setResumeInsights(null);

    try {
      const text = await extractPDFText(file);
      setResumeText(text);
      setPresenceChecklist(buildPresenceChecklist(text));
      const analysisResult = await analyzeResume(text);
      setAnalysis(analysisResult);
      setResumeInsights(extractHighlightedSkills(text, analysisResult));
    } catch (err) {
      alert(`Error: ${err.message}`);
      reset();
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setUploadedFile(null);
    setAnalysis(null);
    setResumeText("");
    setPresenceChecklist([]);
    setResumeInsights(null);
  };

  return (
    <div className="relative min-h-screen p-4 sm:p-6 lg:p-8 flex items-center justify-center overflow-hidden">
      {/* Spline 3D Background - Always visible */}
      <div className="fixed inset-0 w-full h-full z-0" style={{ backgroundColor: '#0f172a' }}>
        <iframe 
          src='https://my.spline.design/retrofuturisticcircuitloop-cmoixGVZCAFSskqNd5KckrRz/' 
          frameBorder='0' 
          width='100%' 
          height='100%'
          className="w-full h-full absolute inset-0"
          style={{ pointerEvents: 'none', border: 'none' }}
          allow="fullscreen"
          allowFullScreen
          title="3D Background"
        />
      </div>
      
      {/* Content Overlay - Subtle darkening for readability */}
      <div className="fixed inset-0 bg-gradient-to-b from-slate-900/50 via-slate-900/20 to-slate-900/50 z-10 pointer-events-none"></div>
      
      <div className="relative z-20 max-w-5xl mx-auto w-full">
        <div className="text-center mb-6">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-light bg-gradient-to-r from-cyan-300 via-teal-200 to-sky-300 bg-clip-text text-transparent mb-2">
            KRISHNA AI RESUME ANALYZER
          </h1>
          <p className="text-slate-300 text-sm sm:text-base">
            Upload your PDF resume and get instant AI feedback.
          </p>
        </div>

        {!uploadedFile && (
          <div className="upload-area">
            <div className="upload-zone">
              <div className="text-4xl sm:text-5xl lg:text-6xl mb-4" aria-hidden>
                📄
              </div>
              <h3 className="text-xl sm:text-2xl text-slate-200 mb-2">
                Upload Your Resume
              </h3>
              <p className="text-slate-400 mb-4 sm:mb-6 text-sm sm:text-base">
                PDF files only – get instant analysis.
              </p>
              <input
                id="file-upload"
                type="file"
                accept="application/pdf"
                onChange={handleFileUpload}
                disabled={isLoading || !aiReady}
                className="text-slate-200"
              />
              <label
                htmlFor="file-upload"
                className={`inline-block btn-primary ${
                  !aiReady ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                Choose PDF File
              </label>
              {!aiReady && (
                <p className="text-sm text-slate-400 mt-2">
                  Initializing AI… please wait a moment.
                </p>
              )}
            </div>
          </div>
        )}
        {isLoading && (
          <div className="p-6 sm:p-8 bg-slate-800 rounded-lg shadow-lg animate-pulse">
            <div className="text-center">
              <div className ="loading-spinner"></div>
              <h3 className="text-xl sm:text-2xl text-slate-200 mb-2">Analyzing your resume...</h3>
              <p className="text-slate-400 text-sm sm:text-base">Please wait while we process your resume...</p>
              </div>
              </div>
        )}
        {analysis && uploadedFile && (
          <div className="space-y-6 p-4 sm:px-8 lg:px-16">
            <div className="file-info-card">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                  <div className="icon-container-xl bg-gradient-to-r from-cyan-300 via-teal-200 to-sky-300 text-white rounded-full p-3">
                    <span className="text-3xl" aria-hidden>
                      📄
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl text-slate-200 mb-1">
                      Analysis Completed
                    </h3>
                    <p className="text-slate-400 text-sm sm:text-base">
                      {uploadedFile.name}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={reset}
                className="btn-secondary flex items-center gap-2"
              >
                <span aria-hidden>🔄</span>
                New Analysis
              </button>
            </div>
            <div className="score-card">
              <div className="text-center mb-6">
                <div className="flex items-center justify-center gap-4 mb-3">
                  <span className="text-2xl" aria-hidden>🏆</span>
                  <h2 className="text-2xl sm:text-3xl text-slate-200 font-medium">Your Overall Score</h2>
                </div>
                <div className="relative">
                  <p className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-cyan-300 via-teal-200 to-sky-300 bg-clip-text text-transparent mb-2">
                    {analysis.overallScore || "7/10"}
                  </p>
                  
                  {/* Interactive Progress Bar */}
                  {(() => {
                    const scoreValue = parseFloat(analysis.overallScore?.split("/")[0] || "7");
                    const isGood = scoreValue >= 7;
                    const isFair = scoreValue >= 5 && scoreValue < 7;
                    const progressClass = isGood 
                      ? "progress-excellent" 
                      : isFair 
                      ? "progress-good" 
                      : "progress-improvement";
                    
                    return (
                      <div className="mb-4 px-2 sm:px-4">
                        <div className="progress-bar relative overflow-hidden">
                          <div
                            className={`h-full rounded-full ${progressClass} transition-all duration-75 ease-linear relative`}
                            style={{
                              width: `${animatedScore}%`
                            }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
                          </div>
                        </div>
                        <div className="flex justify-between items-center mt-2 text-xs sm:text-sm text-slate-400">
                          <span>0</span>
                          <span className="font-medium text-slate-300">{Math.round(animatedScore)}%</span>
                          <span>100%</span>
                        </div>
                      </div>
                    );
                  })()}
                  
                  <p className="text-slate-400 text-sm sm:text-base mb-3">
                    Based on {presenceChecklist.length} key metrics.
                  </p>
                  {(() => {
                    const scoreValue = parseFloat(analysis.overallScore?.split("/")[0] || "7");
                    const isGood = scoreValue >= 7;
                    const isFair = scoreValue >= 5 && scoreValue < 7;
                    return (
                      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
                        isGood 
                          ? "bg-green-500/10 border border-green-500/30 text-green-300" 
                          : isFair
                          ? "bg-yellow-500/10 border border-yellow-500/30 text-yellow-300"
                          : "bg-red-500/10 border border-red-500/30 text-red-300"
                      }`}>
                        <span>{isGood ? "✓" : isFair ? "⚠" : "✗"}</span>
                        <span>{isGood ? "Good" : isFair ? "Needs Improvement" : "Poor"}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Resume Insights - Highlighted & Main Skills */}
            {resumeInsights && (resumeInsights.highlighted.length > 0 || resumeInsights.main.length > 0) && (
              <div className="section-card">
                <div className="flex items-center gap-3 mb-6">
                  <div className="icon-container-lg bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30">
                    <span className="text-2xl" aria-hidden>🔍</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl text-slate-200 font-semibold">
                    Resume Insights
                  </h3>
                </div>

                <div className="space-y-6">
                  {/* Highlighted Skills */}
                  {resumeInsights.highlighted.length > 0 && (
                    <div className="bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-indigo-500/10 rounded-xl p-6 border border-cyan-500/20 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-indigo-500/5 opacity-50"></div>
                      <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-4">
                          <span className="text-xl" aria-hidden>⭐</span>
                          <h4 className="text-lg font-semibold text-slate-200">
                            Highlighted Skills
                          </h4>
                          <span className="text-xs text-cyan-300 bg-cyan-500/20 px-2 py-1 rounded-full border border-cyan-500/30">
                            Key Strengths
                          </span>
                        </div>
                        <p className="text-slate-400 text-sm mb-4">
                          These are your standout technical skills that make you stand out
                        </p>
                        <div className="flex flex-wrap gap-3">
                          {resumeInsights.highlighted.map((skill, index) => (
                            <div
                              key={index}
                              className="group relative"
                            >
                              <span className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-cyan-200 rounded-lg text-sm font-medium border border-cyan-500/40 hover:border-cyan-400/60 hover:scale-110 hover:shadow-lg hover:shadow-cyan-500/20 transition-all duration-300 cursor-default backdrop-blur-sm">
                                <span className="text-cyan-300">✨</span>
                                <span className="capitalize">{skill}</span>
                              </span>
                              <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/20 to-indigo-400/20 rounded-lg blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Main Skills */}
                  {resumeInsights.main.length > 0 && (
                    <div className="bg-gradient-to-br from-slate-800/60 to-slate-700/40 rounded-xl p-6 border border-slate-600/30">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-xl" aria-hidden>🛠️</span>
                        <h4 className="text-lg font-semibold text-slate-200">
                          Main Skills
                        </h4>
                        <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-1 rounded-full border border-slate-600/50">
                          {resumeInsights.main.length} skills
                        </span>
                      </div>
                      <p className="text-slate-400 text-sm mb-4">
                        Additional technical and professional skills found in your resume
                      </p>
                      <div className="flex flex-wrap gap-2.5">
                        {resumeInsights.main.map((skill, index) => (
                          <span
                            key={index}
                            className="px-3.5 py-2 bg-slate-700/40 text-slate-300 rounded-lg text-sm border border-slate-600/40 hover:border-slate-500/60 hover:bg-slate-700/60 hover:text-slate-200 hover:scale-105 transition-all duration-200 cursor-default backdrop-blur-sm capitalize"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ATS Optimization Section */}
            {analysis && (
              <div className="section-card">
                <div className="flex items-center gap-3 mb-6">
                  <div className="icon-container-lg bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30">
                    <span className="text-2xl" aria-hidden>🤖</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl text-slate-200 font-semibold">
                    ATS Optimization
                  </h3>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* ATS Checklist */}
                  {analysis.atsChecklist && analysis.atsChecklist.length > 0 && (
                    <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-xl p-5 border border-indigo-500/20">
                      <h4 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                        <span>✅</span>
                        ATS Requirements Checklist
                      </h4>
                      <div className="space-y-2">
                        {analysis.atsChecklist.map((item, index) => (
                          <div
                            key={index}
                            className="flex items-start gap-3 p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/20 hover:border-indigo-400/40 transition-colors group"
                          >
                            <span className="text-indigo-400 mt-0.5 flex-shrink-0">✓</span>
                            <p className="text-slate-300 text-sm leading-relaxed group-hover:text-slate-200 transition-colors">
                              {item}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Keywords Found */}
                  {analysis.keywords && analysis.keywords.length > 0 && (
                    <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-xl p-5 border border-purple-500/20">
                      <h4 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                        <span>🔑</span>
                        Keywords Detected
                      </h4>
                      <p className="text-slate-400 text-sm mb-4">
                        These keywords help your resume pass ATS filters
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {analysis.keywords.map((keyword, index) => (
                          <span
                            key={index}
                            className="px-3 py-1.5 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 rounded-lg text-sm border border-purple-500/30 hover:border-purple-400/50 hover:scale-105 transition-all cursor-default"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ATS Compatibility Score */}
                  {analysis.performanceMetrics?.atsCompatibility !== undefined && (
                    <div className="bg-gradient-to-br from-violet-500/10 to-indigo-500/10 rounded-xl p-5 border border-violet-500/20 lg:col-span-2">
                      <h4 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                        <span>📊</span>
                        ATS Compatibility Score
                      </h4>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="progress-bar mb-2">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-violet-400 to-indigo-400 transition-all duration-500"
                              style={{
                                width: `${(analysis.performanceMetrics.atsCompatibility / 10) * 100}%`,
                              }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-slate-400">
                            <span>0</span>
                            <span className="font-medium text-slate-300">
                              {analysis.performanceMetrics.atsCompatibility}/10
                            </span>
                            <span>10</span>
                          </div>
                        </div>
                        <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
                          analysis.performanceMetrics.atsCompatibility >= 7
                            ? "bg-green-500/20 text-green-300 border border-green-500/30"
                            : analysis.performanceMetrics.atsCompatibility >= 5
                            ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
                            : "bg-red-500/20 text-red-300 border border-red-500/30"
                        }`}>
                          {analysis.performanceMetrics.atsCompatibility >= 7
                            ? "Excellent"
                            : analysis.performanceMetrics.atsCompatibility >= 5
                            ? "Good"
                            : "Needs Work"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Top Strengths & Main Improvements Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Strengths */}
              {analysis.strengths && analysis.strengths.length > 0 && (
                <div className="section-card group hover:scale-[1.02] transition-transform duration-300">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="icon-container-lg bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30">
                      <span className="text-2xl" aria-hidden>✨</span>
                    </div>
                    <h3 className="text-xl sm:text-2xl text-slate-200 font-semibold">
                      Top Strengths
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {analysis.strengths.slice(0, 3).map((strength, index) => (
                      <div
                        key={index}
                        className="feature-card-green group/item cursor-pointer"
                      >
                        <div className="flex items-start gap-3">
                          <div className="icon-container bg-green-500/20 border border-green-500/30 flex-shrink-0 mt-0.5">
                            <span className="text-green-300 text-sm font-bold">
                              {index + 1}
                            </span>
                          </div>
                          <div className="flex-1">
                            <p className="text-slate-200 text-sm sm:text-base leading-relaxed group-hover/item:text-green-200 transition-colors">
                              {strength}
                            </p>
                          </div>
                          <span className="text-green-400 opacity-0 group-hover/item:opacity-100 transition-opacity text-xl">
                            ✓
                          </span>
                        </div>
                      </div>
                    ))}
                    {analysis.strengths.length > 3 && (
                      <p className="text-slate-400 text-xs text-center mt-2">
                        +{analysis.strengths.length - 3} more strengths
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Main Improvements */}
              {analysis.improvements && analysis.improvements.length > 0 && (
                <div className="section-card group hover:scale-[1.02] transition-transform duration-300">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="icon-container-lg bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30">
                      <span className="text-2xl" aria-hidden>🎯</span>
                    </div>
                    <h3 className="text-xl sm:text-2xl text-slate-200 font-semibold">
                      Main Improvements
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {analysis.improvements.slice(0, 3).map((improvement, index) => (
                      <div
                        key={index}
                        className="feature-card-orange group/item cursor-pointer"
                      >
                        <div className="flex items-start gap-3">
                          <div className="icon-container bg-orange-500/20 border border-orange-500/30 flex-shrink-0 mt-0.5">
                            <span className="text-orange-300 text-sm font-bold">
                              {index + 1}
                            </span>
                          </div>
                          <div className="flex-1">
                            <p className="text-slate-200 text-sm sm:text-base leading-relaxed group-hover/item:text-orange-200 transition-colors">
                              {improvement}
                            </p>
                          </div>
                          <span className="text-orange-400 opacity-0 group-hover/item:opacity-100 transition-opacity text-xl">
                            →
                          </span>
                        </div>
                      </div>
                    ))}
                    {analysis.improvements.length > 3 && (
                      <p className="text-slate-400 text-xs text-center mt-2">
                        +{analysis.improvements.length - 3} more improvements
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Summary Section */}
            {analysis.summary && (
              <div className="section-card">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl" aria-hidden>📋</span>
                  <h3 className="text-xl sm:text-2xl text-slate-200 font-semibold">
                    Resume Summary
                  </h3>
                </div>
                <div className="summary-box">
                  <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                    {analysis.summary}
                  </p>
                </div>
              </div>
            )}

            {/* Performance Metrics Section with 3D Cards */}
            {analysis.performanceMetrics && (
              <div className="section-card">
                <div className="flex items-center gap-3 mb-6">
                  <div className="icon-container-lg bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30">
                    <span className="text-2xl" aria-hidden>📊</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl text-slate-200 font-semibold">
                    Performance Metrics
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {METRIC_CONFIG.map((config) => {
                    const metricValue = analysis.performanceMetrics[config.key] || config.defaultValue;
                    const animatedValue = metricAnimations[config.key] || 0;
                    const percentage = (animatedValue / 10) * 100;
                    const isHovered = hoveredMetric === config.key;
                    
                    return (
                      <div
                        key={config.key}
                        className="group/item relative"
                        onMouseEnter={() => setHoveredMetric(config.key)}
                        onMouseLeave={() => setHoveredMetric(null)}
                        style={{
                          perspective: "1000px",
                        }}
                      >
                        <div
                          className={`relative overflow-hidden transition-all duration-300 bg-gradient-to-br from-slate-800/80 to-slate-700/60 rounded-2xl p-6 border cursor-pointer ${
                            isHovered ? "scale-105" : ""
                          }`}
                          style={{
                            transform: isHovered
                              ? "rotateY(5deg) rotateX(-5deg) translateZ(20px)"
                              : "rotateY(0deg) rotateX(0deg) translateZ(0px)",
                            transformStyle: "preserve-3d",
                            transition: "transform 0.3s ease-out, box-shadow 0.3s ease-out, border-color 0.3s ease-out",
                            borderColor: isHovered
                              ? config.colorClass.includes('emerald') ? 'rgba(16, 185, 129, 0.5)' 
                                : config.colorClass.includes('blue') ? 'rgba(59, 130, 246, 0.5)' 
                                : config.colorClass.includes('violet') ? 'rgba(139, 92, 246, 0.5)' 
                                : config.colorClass.includes('purple') ? 'rgba(168, 85, 247, 0.5)' 
                                : 'rgba(249, 115, 22, 0.5)'
                              : 'rgba(71, 85, 105, 0.5)',
                            boxShadow: isHovered
                              ? `0 20px 40px -10px rgba(0, 0, 0, 0.5), 0 0 20px ${config.colorClass.includes('emerald') ? 'rgba(16, 185, 129, 0.3)' : config.colorClass.includes('blue') ? 'rgba(59, 130, 246, 0.3)' : config.colorClass.includes('violet') ? 'rgba(139, 92, 246, 0.3)' : config.colorClass.includes('purple') ? 'rgba(168, 85, 247, 0.3)' : 'rgba(249, 115, 22, 0.3)'}`
                              : "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                          }}
                        >
                          {/* 3D Card Front */}
                          <div className="relative z-10">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <div className={`icon-container bg-gradient-to-r ${config.colorClass} border border-white/20`}>
                                  <span className="text-xl">{config.icon}</span>
                                </div>
                                <h4 className="text-lg font-semibold text-slate-200">
                                  {config.label}
                                </h4>
                              </div>
                            </div>
                            
                            {/* Score Display */}
                            <div className="mb-4">
                              <div className="flex items-baseline gap-2 mb-2">
                                <span className={`text-3xl font-bold bg-gradient-to-r ${config.colorClass} bg-clip-text text-transparent`}>
                                  {animatedValue.toFixed(1)}
                                </span>
                                <span className="text-slate-400 text-sm">/ 10</span>
                              </div>
                              
                              {/* Progress Bar */}
                              <div className="progress-bar-small relative overflow-hidden">
                                <div
                                  className={`h-full rounded-full bg-gradient-to-r ${config.colorClass} transition-all duration-75 ease-linear relative`}
                                  style={{
                                    width: `${percentage}%`,
                                  }}
                                >
                                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
                                </div>
                              </div>
                            </div>
                            
                            {/* Status Indicator */}
                            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                              animatedValue >= 7
                                ? "bg-green-500/20 text-green-300"
                                : animatedValue >= 5
                                ? "bg-yellow-500/20 text-yellow-300"
                                : "bg-red-500/20 text-red-300"
                            }`}>
                              <span>{animatedValue >= 7 ? "✓" : animatedValue >= 5 ? "⚠" : "✗"}</span>
                              <span>{animatedValue >= 7 ? "Excellent" : animatedValue >= 5 ? "Good" : "Needs Work"}</span>
                            </div>
                          </div>
                          
                          {/* 3D Card Back Glow Effect */}
                          {isHovered && (
                            <div
                              className={`absolute inset-0 bg-gradient-to-r ${config.colorClass} opacity-20 blur-xl -z-10`}
                              style={{
                                transform: "translateZ(-10px)",
                              }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* All Strengths Section - Show if more than 3 */}
            {analysis.strengths && analysis.strengths.length > 3 && (
              <div className="section-card">
                <div className="flex items-center gap-3 mb-4">
                  <div className="icon-container-lg bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30">
                    <span className="text-2xl" aria-hidden>💪</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl text-slate-200 font-semibold">
                    All Strengths
                  </h3>
                </div>
                <ul className="space-y-3">
                  {analysis.strengths.map((strength, index) => (
                    <li key={index} className="list-item-green group cursor-pointer hover:scale-[1.02] transition-transform">
                      <span className="text-green-300 mr-2 group-hover:text-green-200 transition-colors">✓</span>
                      <span className="text-slate-300 text-sm sm:text-base group-hover:text-slate-200 transition-colors">
                        {strength}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* All Improvements Section - Show if more than 3 */}
            {analysis.improvements && analysis.improvements.length > 3 && (
              <div className="section-card">
                <div className="flex items-center gap-3 mb-4">
                  <div className="icon-container-lg bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30">
                    <span className="text-2xl" aria-hidden>🔧</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl text-slate-200 font-semibold">
                    All Improvements
                  </h3>
                </div>
                <ul className="space-y-3">
                  {analysis.improvements.map((improvement, index) => (
                    <li key={index} className="list-item-orange group cursor-pointer hover:scale-[1.02] transition-transform">
                      <span className="text-orange-300 mr-2 group-hover:text-orange-200 transition-colors">•</span>
                      <span className="text-slate-300 text-sm sm:text-base group-hover:text-slate-200 transition-colors">
                        {improvement}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
