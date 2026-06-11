import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, arrayUnion, deleteField } from 'firebase/firestore';

// --- ゲームの基本設定 ---
const TOTAL_PUZZLES = 21; 
const LIMIT_TIME_MINUTES = 30; 

// --- Step 1 正解キーワード登録 ---
const ANSWERS = {
  1: "ぱんく",
  2: "いるい",
  3: "こはくいろ",
  4: "ぷらいす",
  5: "ういるす",
  6: "すきる",
  7: "とーすたー",
  8: "さぶまりん",
  9: "せかんど",
  20: "きー", 
  21: "きかい", // 21問目の正解を登録
};

// デコード適用後にのみ受け付ける正解の定義
const DECODED_ANSWERS = {
  10: { req: "10-アカジ", ans: "ひんと" },
  11: { req: "11-アンチ", ans: "かたぬき" },
  12: { req: "12-ジカン", ans: "たいむ" }, 
  13: { req: "13-カウ",   ans: "ごくあくにん"},
  14: { req: "14-カンジ", ans: "きみ"},
  15: { req: "15-アイチ", ans: "ふかい"},
  16: { req: "16-カナイ", ans: "かれい" },
  17: { req: "17-ツイン", ans: "せびれ" },
  18: { req: "18-ツチ",   ans: "こうひょう" }, 
  19: { req: "19-カンジョウ", ans: "あさって"},
};

// 有効なデコードコンソールの組み合わせリスト
const VALID_DECODES = {
  "10": "アカジ",
  "11": "アンチ",
  "12": "ジカン",
  "13": "カウ",
  "14": "カンジ",
  "15": "アイチ",
  "16": "カナイ",
  "17": "ツイン",
  "18": "ツチ",
  "19": "カンジョウ",
};

// カタカナ文字リスト
const KATAKANA_CHARS = ["イ", "ン", "チ", "カ", "ア", "ウ", "ツ", "ジ", "ョ", "ク", "セ"];

// プリロード（事前読み込み）する画像のリストを自動生成
const IMAGE_LIST = [
  '/images/explain_01.png', '/images/explain_02.png', '/images/explain_03.png', '/images/explain_04.png',
  ...Array.from({ length: 21 }, (_, i) => `/images/riddle_${String(i + 1).padStart(2, '0')}.png`),
  ...Object.keys(DECODED_ANSWERS).map(id => `/images/riddle_${String(id).padStart(2, '0')}-new.png`),
  '/images/riddle_10-2.png',
  '/images/riddle_20-lock.png',
  '/images/riddle_20-key.png'
];

// --- Firebase の初期設定 ---
const firebaseConfig = {
  apiKey: "AIzaSyAkiOFqqR_6ODgvNRBOjOBk7BlsaahSU30",
  authDomain: "cyber-enigma-db.firebaseapp.com",
  projectId: "cyber-enigma-db",
  storageBucket: "cyber-enigma-db.firebasestorage.app",
  messagingSenderId: "33768394400",
  appId: "1:33768394400:web:2e5244030184eefdc383c5",
  measurementId: "G-7FQ96Z1NQM"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'amata-bomb-app';

const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main');

// ゲームの初期状態
const initialGameState = {
  currentStep: 1, 
  solvedPuzzles: [], 
  timer: {
    isRunning: false,
    startTime: 0,
    remainingTime: LIMIT_TIME_MINUTES * 60 * 1000, 
  },
  logs: [],
  players: {}, 
  bombState: { '10': [], '20': [], '30': [] },
  appliedGimmicks: [], 
  unlockedKeys: [],
  finalAnswer: null 
};

export default function App() {
  const [user, setUser] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLogged, setIsLogged] = useState(false);
  const [isTimeUp, setIsTimeUp] = useState(false); 

  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    let loadedCount = 0;
    const totalImages = IMAGE_LIST.length;

    const loadImage = (src) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          loadedCount++;
          setLoadProgress(Math.floor((loadedCount / totalImages) * 100));
          resolve();
        };
        img.onerror = () => {
          loadedCount++;
          setLoadProgress(Math.floor((loadedCount / totalImages) * 100));
          resolve();
        };
        img.src = src;
      });
    };

    Promise.all(IMAGE_LIST.map(loadImage)).then(() => {
      setTimeout(() => setIsLoadingAssets(false), 800);
    });

    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setGameState(docSnap.data());
      } else {
        setDoc(docRef, initialGameState);
      }
    }, (error) => console.error(error));
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!isLogged || isAdmin || !user) return;
    updateDoc(docRef, { [`players.${user.uid}`]: playerName });
    const handleUnload = () => updateDoc(docRef, { [`players.${user.uid}`]: deleteField() }).catch(() => {});
    window.addEventListener('beforeunload', handleUnload);
    return () => { window.removeEventListener('beforeunload', handleUnload); handleUnload(); };
  }, [isLogged, isAdmin, user, playerName]);

  useEffect(() => {
    if (!gameState?.timer) return;
    let interval;
    const checkTime = () => {
      if (gameState.timer.isRunning) {
        const elapsed = Date.now() - gameState.timer.startTime;
        setIsTimeUp(Math.max(0, gameState.timer.remainingTime - elapsed) <= 0);
      } else {
        setIsTimeUp(gameState.timer.remainingTime <= 0);
      }
    };
    checkTime();
    if (gameState.timer.isRunning) interval = setInterval(checkTime, 1000);
    return () => clearInterval(interval);
  }, [gameState?.timer]);

  const handleLogin = (e) => {
    e.preventDefault();
    const inputVal = e.target.name.value;
    if (!inputVal) return;
    if (inputVal === '4hS9nt') { setPlayerName('管理者'); setIsAdmin(true); } 
    else { setPlayerName(inputVal); setIsAdmin(false); }
    setIsLogged(true);
  };

  const handleLogout = () => {
    if (!isAdmin && user) updateDoc(docRef, { [`players.${user.uid}`]: deleteField() });
    setIsLogged(false); setPlayerName(''); setIsAdmin(false);
  };

  if (isLoadingAssets) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-bold text-center text-blue-500 mb-8 tracking-widest animate-pulse" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            SYSTEM INITIALIZING...
          </h1>
          <div className="w-full bg-gray-900 border border-blue-900 rounded-full h-4 mb-4 overflow-hidden relative shadow-[0_0_15px_rgba(59,130,246,0.3)]">
            <div 
              className="bg-blue-500 h-full transition-all duration-300 ease-out" 
              style={{ width: `${loadProgress}%` }}
            ></div>
          </div>
          <p className="text-blue-400 text-center font-mono text-2xl tracking-widest">{loadProgress}%</p>
          <p className="text-gray-500 text-xs text-center mt-4">Loading Assets...</p>
        </div>
      </div>
    );
  }

  if (!isLogged) return <LoginScreen onLogin={handleLogin} />;
  if (!gameState) return <div className="min-h-screen bg-gray-950 text-blue-400 flex items-center justify-center">システムに接続中...</div>;

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans overflow-hidden relative">
      <Header timer={gameState.timer} currentStep={gameState.currentStep} isAdmin={isAdmin} playerName={playerName} onLogout={handleLogout} />

      {isAdmin ? (
        <AdminBoard gameState={gameState} docRef={docRef} initialGameState={initialGameState} />
      ) : (
        <PlayerBoard gameState={gameState} docRef={docRef} playerName={playerName} />
      )}

      <ToastContainer logs={gameState.logs} />

      {!isAdmin && (!gameState.timer.isRunning || isTimeUp) && gameState.currentStep < 5 && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-md pointer-events-auto">
          <div className="text-center p-8 bg-gray-900/80 border border-blue-900 rounded-lg shadow-[0_0_30px_rgba(59,130,246,0.2)]">
            <h2 className={`text-3xl md:text-5xl font-bold tracking-widest mb-4 ${isTimeUp ? 'text-red-500' : 'text-gray-300'}`}>
              {isTimeUp ? "TIME UP" : "SYSTEM PAUSED"}
            </h2>
            <p className="text-blue-400 animate-pulse text-lg">再開までしばらくお待ちください...</p>
          </div>
        </div>
      )}
    </div>
  );
}

function LoginScreen({ onLogin }) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="bg-gray-900 p-8 rounded-lg border border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)] w-full max-w-md animate-fade-in-up">
        <h1 className="text-3xl font-bold text-center text-blue-400 mb-8 tracking-widest">数多の爆弾からの生還</h1>
        <form onSubmit={onLogin} className="flex flex-col gap-4">
          <p className="text-gray-400 text-sm text-center">アクセスコード（名前）を入力してください</p>
          <input name="name" type="text" required placeholder="ニックネーム" className="p-3 bg-black border border-blue-800 text-white rounded focus:outline-none focus:border-blue-400" />
          <button type="submit" className="mt-4 p-3 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold transition-all shadow-[0_0_10px_#2563eb]">システムに接続</button>
        </form>
      </div>
    </div>
  );
}

function Header({ timer, currentStep, isAdmin, playerName, onLogout }) {
  const [displayTime, setDisplayTime] = useState(timer.remainingTime);

  useEffect(() => {
    let interval;
    if (timer.isRunning) {
      interval = setInterval(() => {
        const now = Date.now();
        const elapsed = now - timer.startTime;
        setDisplayTime(Math.max(0, timer.remainingTime - elapsed));
      }, 100);
    } else {
      setDisplayTime(Math.max(0, timer.remainingTime));
    }
    return () => clearInterval(interval);
  }, [timer]);

  const m = Math.floor(displayTime / 60000).toString().padStart(2, '0');
  const s = Math.floor((displayTime % 60000) / 1000).toString().padStart(2, '0');
  
  if (currentStep === 5 || currentStep === 6) return null; 

  const stepText = currentStep === 3 ? 'LAST STEP' : `STEP ${currentStep}`;

  return (
    <div className="w-full bg-black border-b border-blue-900 p-4 flex items-center justify-between shadow-lg relative z-[60]">
      <div className="text-blue-500 font-bold tracking-widest hidden sm:block flex-1">
        {isAdmin ? '>> ADMIN CONSOLE' : '>> PLAYER TERMINAL'}
      </div>
      <div className="absolute left-1/2 transform -translate-x-1/2">
        <div 
          className={`text-4xl sm:text-5xl bg-gray-900 px-6 py-2 rounded-lg border-2 shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-colors duration-300
            ${timer.isRunning ? (displayTime === 0 ? 'text-red-600 border-red-600 animate-pulse' : 'text-red-500 border-red-900') : 'text-gray-500 border-gray-700'}`}
          style={{ fontFamily: "'Orbitron', sans-serif" }}
        >
          {m}:{s}
      </div>
      </div>
      <div className="flex items-center justify-end gap-4 flex-1">
        <div className="text-gray-400 font-bold text-xl hidden sm:block">{stepText}</div>
        <button onClick={onLogout} className="px-4 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 transition-colors relative z-[60]" title="クリックでログアウト">
          {playerName}
        </button>
      </div>
    </div>
  );
}

// ==========================================
// プレイヤー画面
// ==========================================
function PlayerBoard({ gameState, docRef, playerName }) {
  const [activePuzzle, setActivePuzzle] = useState(null);
  const [activeExplain, setActiveExplain] = useState(null);

  if (gameState.currentStep === 5) return <EndingScreen type="A" />;
  if (gameState.currentStep === 6) return <EndingScreen type="B" />;

  let puzzlesToShow = [];
  if (gameState.currentStep >= 1) {
    puzzlesToShow = [...puzzlesToShow, ...Array.from({length: 9}, (_, i) => i + 1)];
    const step1Puzzles = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const isStep1AllSolved = step1Puzzles.every(id => gameState.solvedPuzzles.includes(id));
    if (isStep1AllSolved) {
      puzzlesToShow.push(10);
    }
  }
  if (gameState.currentStep >= 2) puzzlesToShow = [...puzzlesToShow, ...Array.from({length: 10}, (_, i) => i + 11)]; 
  if (gameState.currentStep >= 3) puzzlesToShow = [...puzzlesToShow, 21]; 

  let explainsToShow = [];
  if (gameState.currentStep >= 1) explainsToShow.push('01');
  if (gameState.currentStep >= 2) explainsToShow.push('02');
  if (gameState.currentStep >= 3) {
    explainsToShow.push('03'); 
    explainsToShow.push('04'); 
  }

  const totalSolvedAndKeys = gameState.solvedPuzzles.length + (gameState.unlockedKeys?.includes('20') ? 1 : 0);

  const step1Basic = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const isUnlocked10 = step1Basic.every(id => gameState.solvedPuzzles.includes(id));

  const handleSolve = async (puzzleId) => {
    const logEntry = { id: Date.now().toString(), message: `${playerName}がFILE #${puzzleId}を解除しました。` };
    
    const nextSolved = [...gameState.solvedPuzzles, puzzleId];
    const willUnlock10 = step1Basic.every(id => nextSolved.includes(id));
    const wasUnlocked10 = step1Basic.every(id => gameState.solvedPuzzles.includes(id));

    let updates = {
      solvedPuzzles: arrayUnion(puzzleId),
      logs: arrayUnion(logEntry)
    };

    if (willUnlock10 && !wasUnlocked10) {
      updates.logs = arrayUnion(
        logEntry,
        { id: (Date.now() + 10).toString(), message: "10問目が解放されました！" }
      );
    }

    await updateDoc(docRef, updates);
    setActivePuzzle(null);
  };

  return (
    <div className="p-6 pb-32 max-w-6xl mx-auto flex flex-col gap-6">
      {/* 説明書き（プレビュー）エリア */}
      <div className="border-b border-gray-800 pb-4">
        <h3 className="text-gray-500 text-sm font-bold mb-3 tracking-widest">DATA FILES (クリックで拡大)</h3>
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {explainsToShow.map(id => (
            <button key={id} onClick={() => setActiveExplain(id)} className="w-32 h-20 bg-gray-900 border border-gray-600 rounded cursor-pointer hover:border-blue-400 flex-shrink-0 relative overflow-hidden group shadow-[0_0_10px_rgba(0,0,0,0.5)] transition-colors">
              <img src={`/images/explain_${id}.png`} alt={`説明 ${id}`} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" onError={(e) => e.target.style.display = 'none'} />
              <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500 pointer-events-none group-hover:text-blue-400">explain_{id}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 謎解きボタンエリア */}
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
        {puzzlesToShow.map(id => {
          const isSolved = gameState.solvedPuzzles.includes(id);
          const isBomb = id === 10; 
          const isKeyLocked20 = id === 20 && !gameState.unlockedKeys?.includes('20'); 
          const isLocked10 = id === 10 && !isUnlocked10;

          return (
            <button
              key={id}
              onClick={() => {
                if (isLocked10) return; 
                setActivePuzzle(id);
              }}
              disabled={isLocked10} 
              className={`aspect-square rounded flex items-center justify-center text-xl font-bold transition-all duration-300 relative overflow-hidden
                ${isSolved 
                  ? 'bg-blue-900/50 text-blue-300 border border-blue-400 shadow-[0_0_15px_#3b82f6]' 
                  : (isLocked10
                    ? 'bg-gray-950/40 text-gray-700 border border-gray-900 cursor-not-allowed opacity-45'
                    : (isKeyLocked20 ? 'bg-amber-950/40 text-amber-500 hover:bg-amber-950/60 border border-amber-800 animate-pulse' 
                    : (isBomb ? 'bg-red-900/30 text-red-500 hover:bg-red-900/50 border border-red-800 shadow-[0_0_10px_rgba(220,38,38,0.1)]' 
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'))) 
                }`}
            >
              {isBomb && !isSolved && !isLocked10 && <div className="absolute top-0 right-0 w-3 h-3 bg-red-600 rounded-bl-full"></div>}
              {isLocked10 && <div className="absolute top-1 left-1 text-[10px] text-gray-600">🔒</div>}
              {isKeyLocked20 && <div className="absolute top-1 left-1 text-[10px] text-amber-500">🔒</div>}
              {id}
            </button>
          );
        })}
      </div>

      {/* DECODE CONSOLE */}
      {gameState.currentStep >= 2 && (
        <DecoderPanel 
          solvedCount={totalSolvedAndKeys} 
          docRef={docRef} 
          gameState={gameState} 
          playerName={playerName}
        />
      )}

      {/* 21問目の最終解答表示エリア */}
      {gameState.finalAnswer && (
        <div className="mt-4 p-6 bg-gray-900 border border-yellow-500 rounded-lg text-center shadow-[0_0_20px_rgba(234,179,8,0.3)] animate-fade-in-up relative overflow-hidden">
          <div className="absolute inset-0 bg-yellow-500/10 animate-pulse"></div>
          <h3 className="text-yellow-500 text-sm font-bold tracking-widest mb-2 relative z-10">{" >> FINAL ANSWER SUBMITTED "}</h3>
          <p className="text-white text-3xl font-bold tracking-widest relative z-10">最終解答：{gameState.finalAnswer}</p>
        </div>
      )}

      {/* ポップアップ、モーダルの展開 */}
      {activePuzzle !== null && (
        activePuzzle === 10 ? (
          <BombModal 
            puzzleId={activePuzzle}
            isSolved={gameState.solvedPuzzles.includes(activePuzzle)}
            onClose={() => setActivePuzzle(null)}
            gameState={gameState}
            playerName={playerName}
            docRef={docRef}
          />
        ) : activePuzzle === 20 ? (
          <Puzzle20Modal
            isSolved={gameState.solvedPuzzles.includes(20)}
            isKeyUnlocked={gameState.unlockedKeys?.includes('20')}
            onClose={() => setActivePuzzle(null)}
            gameState={gameState}
            playerName={playerName}
            docRef={docRef}
          />
        ) : activePuzzle === 21 ? (
          <Puzzle21Modal 
            puzzleId={activePuzzle} 
            isSolved={gameState.solvedPuzzles.includes(activePuzzle)}
            onClose={() => setActivePuzzle(null)}
            gameState={gameState}
            playerName={playerName}
            docRef={docRef}
          />
        ) : (
          <PuzzleModal 
            puzzleId={activePuzzle} 
            isSolved={gameState.solvedPuzzles.includes(activePuzzle)}
            onClose={() => setActivePuzzle(null)}
            onSolve={handleSolve}
            gameState={gameState} 
          />
        )
      )}

      {activeExplain !== null && <ExplainModal explainId={activeExplain} onClose={() => setActiveExplain(null)} />}
    </div>
  );
}

// ==========================================
// 通常の謎ポップアップ
// ==========================================
function PuzzleModal({ puzzleId, isSolved, onClose, onSolve, gameState }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const onSubmit = (e) => {
    e.preventDefault();
    if (!/^[ぁ-んー]+$/.test(input)) return setError('ひらがなのみで入力してください。');

    const decodeRule = DECODED_ANSWERS[puzzleId];
    if (decodeRule && input === decodeRule.ans) {
      if (gameState.appliedGimmicks?.includes(decodeRule.req)) {
        onSolve(puzzleId); 
        return;
      } else {
        setError('そのコードはこの謎画像に対応していません'); 
        return;
      }
    }

    if (ANSWERS[puzzleId] && input === ANSWERS[puzzleId]) {
      if (decodeRule && gameState.appliedGimmicks?.includes(decodeRule.req)) {
        setError('アクセス拒否：キーワードが一致しません');
        return;
      }
      onSolve(puzzleId);
      return;
    }

    setError('アクセス拒否：キーワードが一致しません');
  };

  const decodeRule = DECODED_ANSWERS[puzzleId];
  const isDecoded = decodeRule && gameState.appliedGimmicks?.includes(decodeRule.req);
  const displayImg = isDecoded ? `riddle_${String(puzzleId).padStart(2, '0')}-new.png` : `riddle_${String(puzzleId).padStart(2, '0')}.png`;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[70] backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-gray-900 border border-blue-500 rounded-lg max-w-4xl w-full p-6 shadow-[0_0_30px_rgba(59,130,246,0.3)] flex flex-col max-h-[95vh] animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2 shrink-0">
          <h2 className="text-xl font-bold text-blue-400">FILE #{puzzleId}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl p-1">&times;</button>
        </div>
        
        <div className="bg-black rounded border border-gray-700 mb-6 flex-grow relative h-[50vh] sm:h-[60vh] flex items-center justify-center overflow-hidden">
          <img 
            src={`/images/${displayImg}`} 
            alt={`謎 ${puzzleId}`} 
            className="max-w-full max-h-full object-contain absolute z-10" 
            onError={(e) => e.target.style.display = 'none'} 
          />
          <div className="text-gray-500 flex flex-col items-center justify-center h-full w-full absolute top-0 left-0 z-0">
            <span>[画像未設定]</span>
            <span className="text-xs mt-2">public/images/{displayImg}</span>
          </div>
        </div>

        <div className="shrink-0">
          {isSolved ? (
            <div className="text-center py-4 bg-blue-900/30 border border-blue-500 rounded text-blue-300 font-bold tracking-widest text-2xl shadow-[0_0_15px_#3b82f6]">正解 / CLEAR</div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <input type="text" value={input} onChange={(e) => {setInput(e.target.value); setError('');}} placeholder="ひらがなで入力..." className="w-full p-3 bg-black border border-blue-800 text-white rounded text-center text-lg focus:outline-none focus:border-blue-400" autoFocus />
              {error && <p className="text-red-400 text-sm text-center">{error}</p>}
              <button type="submit" className="w-full p-3 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded transition-colors">送信 / SUBMIT</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 爆弾解除ポップアップ（10問目）
// ==========================================
function BombModal({ puzzleId, isSolved, onClose, gameState, playerName, docRef }) {
  const [confirmWire, setConfirmWire] = useState(null); 
  const [zoomImage, setZoomImage] = useState(null); 
  
  const [textInput, setTextInput] = useState('');
  const [textError, setTextError] = useState('');

  const isStep3OrLater = gameState.currentStep >= 3;

  const colors = [
    { id: 'red', name: '赤', bg: 'bg-red-600', shadow: 'shadow-red-500' },
    { id: 'blue', name: '青', bg: 'bg-blue-600', shadow: 'shadow-blue-500' },
    { id: 'yellow', name: '黄', bg: 'bg-yellow-500', shadow: 'shadow-yellow-400' },
    { id: 'green', name: '緑', bg: 'bg-green-600', shadow: 'shadow-green-500' },
    { id: 'purple', name: '紫', bg: 'bg-purple-600', shadow: 'shadow-purple-500' },
    { id: 'orange', name: '橙', bg: 'bg-orange-500', shadow: 'shadow-orange-400' }
  ];

  const executeCut = async () => {
    const color = confirmWire;
    setConfirmWire(null);
    const colorObj = colors.find(c => c.id === color);
    const correctWires = ['purple'];
    
    if (!correctWires.includes(color)) {
      const logMsg = `【致命的エラー】${playerName}が誤ったコード(${colorObj.name})を切断。爆発が誘発されました。`;
      await updateDoc(docRef, {
        currentStep: 6, 
        logs: arrayUnion({ id: Date.now().toString(), message: logMsg })
      });
      return; 
    }
    
    const currentCutWires = gameState.bombState?.[puzzleId] || [];
    const newCutWires = [...currentCutWires, color];
    await updateDoc(docRef, {
      [`bombState.${puzzleId}`]: newCutWires,
      logs: arrayUnion({ id: Date.now().toString(), message: `${playerName}がコード(${colorObj.name})を切断しました。` })
    });
    
    const allCorrectCut = correctWires.every(w => newCutWires.includes(w));
    if (allCorrectCut) {
      await updateDoc(docRef, {
        solvedPuzzles: arrayUnion(puzzleId),
        logs: arrayUnion({ id: (Date.now() + 1).toString(), message: `FILE #${puzzleId} の爆弾解除に成功！` })
      });
    }
  };

  const onSubmitText = async (e) => {
    e.preventDefault();
    if (!/^[ぁ-んー]+$/.test(textInput)) return setTextError('ひらがなのみで入力してください。');
    
    if (textInput === DECODED_ANSWERS[10].ans) {
      await updateDoc(docRef, {
        solvedPuzzles: arrayUnion(puzzleId),
        logs: arrayUnion({ id: Date.now().toString(), message: `${playerName}がFILE #${puzzleId}の隠しキーワードを解除しました！` })
      });
    } else {
      setTextError('アクセス拒否：キーワードが一致しません');
    }
  };

  const isAkajiApplied = gameState.appliedGimmicks?.includes("10-アカジ");
  const img1 = isAkajiApplied ? "riddle_10-1-new.png" : "riddle_10-1.png";
  const img2 = "riddle_10-2.png";

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[70] backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-gray-900 border-2 border-red-800 rounded-lg max-w-4xl w-full p-6 shadow-[0_0_50px_rgba(220,38,38,0.3)] relative flex flex-col max-h-[95vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2 shrink-0">
          <h2 className="text-2xl font-bold text-red-500 animate-pulse tracking-widest">DANGER: BOMB FILE #{puzzleId}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl">&times;</button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 shrink relative min-h-[200px] max-h-[45vh] overflow-y-auto p-2 bg-black rounded border border-gray-800">
          <div 
            onClick={() => setZoomImage(img1)}
            className="relative aspect-video bg-zinc-950 rounded overflow-hidden flex items-center justify-center border border-zinc-800 cursor-pointer hover:border-red-500 transition-colors group"
          >
            <img src={`/images/${img1}`} alt="謎 10-1" className="w-full h-full object-contain absolute top-0 left-0 z-10" onError={(e) => e.target.style.display = 'none'} />
            <div className="absolute inset-0 z-20 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs text-white font-bold transition-opacity">🔎 クリックで拡大</div>
            <div className="text-gray-500 text-xs text-center z-0">
              <span>[左画像 未設定]</span>
              <span className="block text-[10px] mt-1">{img1}</span>
            </div>
          </div>
          <div 
            onClick={() => setZoomImage(img2)}
            className="relative aspect-video bg-zinc-950 rounded overflow-hidden flex items-center justify-center border border-zinc-800 cursor-pointer hover:border-red-500 transition-colors group"
          >
            <img src={`/images/${img2}`} alt="謎 10-2" className="w-full h-full object-contain absolute top-0 left-0 z-10" onError={(e) => e.target.style.display = 'none'} />
            <div className="absolute inset-0 z-20 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs text-white font-bold transition-opacity">🔎 クリックで拡大</div>
            <div className="text-gray-500 text-xs text-center z-0">
              <span>[右画像 未設定]</span>
              <span className="block text-[10px] mt-1">{img2}</span>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 p-8 rounded-lg border-8 border-zinc-800 relative overflow-hidden flex justify-between items-center h-40 sm:h-56 shadow-inner shrink-0 animate-pulse"
             style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.1), rgba(0,0,0,0.1) 15px, rgba(0,0,0,0.3) 15px, rgba(0,0,0,0.3) 30px)' }}>
          <div className="absolute top-3 left-3 w-5 h-5 bg-gradient-to-br from-gray-400 to-gray-600 rounded-full flex justify-center items-center shadow-md"><div className="w-full h-0.5 bg-gray-800 rotate-45"></div></div>
          <div className="absolute top-3 right-3 w-5 h-5 bg-gradient-to-br from-gray-400 to-gray-600 rounded-full flex justify-center items-center shadow-md"><div className="w-full h-0.5 bg-gray-800 rotate-45"></div></div>
          <div className="absolute bottom-3 left-3 w-5 h-5 bg-gradient-to-br from-gray-400 to-gray-600 rounded-full flex justify-center items-center shadow-md"><div className="w-full h-0.5 bg-gray-800 rotate-45"></div></div>
          <div className="absolute bottom-3 right-3 w-5 h-5 bg-gradient-to-br from-gray-400 to-gray-600 rounded-full flex justify-center items-center shadow-md"><div className="w-full h-0.5 bg-gray-800 rotate-45"></div></div>

          {colors.map(c => {
            const isCut = (gameState.bombState?.[puzzleId] || []).includes(c.id);
            return (
              <div key={c.id} className="relative w-8 sm:w-10 h-full bg-black/80 rounded-full flex justify-center py-2 shadow-[inset_0_0_15px_rgba(0,0,0,1)] border border-gray-800">
                {!isCut ? (
                  <button 
                    onClick={() => !isSolved && setConfirmWire(c.id)} 
                    disabled={isSolved}
                    className={`w-4 sm:w-5 h-full rounded-full ${c.bg} shadow-[0_0_15px_var(--tw-shadow-color)] ${c.shadow} transition-all ${!isSolved && 'hover:brightness-150 cursor-pointer hover:scale-105'}`}
                  ></button>
                ) : (
                  <div className="w-4 sm:w-5 h-full flex flex-col justify-between items-center">
                     <div className={`w-full h-6 sm:h-10 rounded-t-full ${c.bg} opacity-40`}></div>
                     <div className="w-1 h-1 bg-yellow-200 rounded-full shadow-[0_0_10px_#fef08a] animate-ping absolute top-8 sm:top-12"></div>
                     <div className={`w-full h-6 sm:h-10 rounded-b-full ${c.bg} opacity-40`}></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 【修正】10問目の隠し解答欄を常に表示（ただしSTEP3まではロック） */}
        {!isSolved && (
          <form onSubmit={onSubmitText} className="bg-black p-4 rounded-lg border border-blue-900 mt-4 shrink-0 shadow-[0_0_15px_rgba(59,130,246,0.15)] relative">
            <p className="text-blue-400 text-xs mb-2 tracking-widest font-bold">
              {" >> HIDDEN TERMINAL "}
            </p>
            
            {!isStep3OrLater && (
              <div className="absolute inset-0 bg-black/60 z-10 flex items-center justify-center rounded-lg backdrop-blur-[1px]">
                <span className="text-gray-400 text-sm font-bold animate-pulse">🔒 </span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 relative">
              <input 
                type="text" 
                value={textInput} 
                onChange={(e) => {setTextInput(e.target.value); setTextError('');}} 
                placeholder={isStep3OrLater ? "ひらがなで入力..." : "アクセス制限中"} 
                disabled={!isStep3OrLater}
                className="flex-grow p-3 bg-gray-900 border border-blue-800 text-white rounded text-center focus:outline-none focus:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed" 
              />
              <button 
                type="submit" 
                disabled={!isStep3OrLater}
                className="px-6 p-3 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                送信 / SUBMIT
              </button>
            </div>
            {textError && <p className="text-red-400 text-xs text-center mt-2">{textError}</p>}
          </form>
        )}

        {isSolved && (
          <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
            <div className="border-8 border-green-500 text-green-500 font-bold text-5xl md:text-6xl px-10 py-6 rounded rotate-[-15deg] shadow-[0_0_30px_#22c55e] bg-black/60 backdrop-blur-sm">
              DEFUSED
            </div>
          </div>
        )}

        {confirmWire && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md rounded-lg p-4">
            <div className="bg-gray-900 border-4 border-red-600 p-8 rounded-lg max-w-md w-full text-center shadow-[0_0_50px_rgba(220,38,38,0.8)] animate-fade-in">
              <h3 className="text-red-500 font-black text-3xl sm:text-4xl mb-6 animate-pulse tracking-widest">【 警 告 】</h3>
              <p className="text-white font-bold mb-4 text-lg sm:text-xl leading-relaxed">
                コードを切った時点で<br/><span className="text-red-400">全員の画面に反映</span>されます。
              </p>
              <p className="text-gray-300 text-sm sm:text-base mb-8 border-t border-gray-700 pt-4">
                この操作は一度やったら戻れません。<br/>全員の許可を得ましたか？
              </p>
              <div className="flex gap-4 sm:gap-6">
                <button onClick={executeCut} className="flex-1 bg-red-700 hover:bg-red-500 text-white font-bold py-3 sm:py-4 rounded text-lg sm:text-xl transition-all shadow-[0_0_15px_#b91c1c] hover:scale-105">はい</button>
                <button onClick={() => setConfirmWire(null)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 sm:py-4 rounded text-lg sm:text-xl transition-colors">いいえ</button>
              </div>
            </div>
          </div>
        )}

        {zoomImage && (
          <div 
            onClick={() => setZoomImage(null)}
            className="fixed inset-0 z-[120] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md cursor-zoom-out animate-fade-in"
          >
            <div className="relative max-w-5xl max-h-[90vh] w-full h-full flex flex-col justify-center items-center">
              <img 
                src={`/images/${zoomImage}`} 
                alt="拡大表示" 
                className="max-w-full max-h-full object-contain shadow-2xl rounded border border-gray-800"
                onError={(e) => e.target.style.display = 'none'}
              />
              <div className="text-gray-500 text-xs text-center mt-2 pointer-events-none">背景をクリックして元に戻る</div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ==========================================
// 20問目の謎ポップアップ
// ==========================================
function Puzzle20Modal({ isSolved, isKeyUnlocked, onClose, gameState, playerName, docRef }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [showKeyRiddle, setShowKeyRiddle] = useState(false); 

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!/^[ぁ-んー]+$/.test(input)) return setError('ひらがなのみで入力してください。');

    if (!isKeyUnlocked) {
      if (input === ANSWERS[20]) {
        await updateDoc(docRef, {
          unlockedKeys: arrayUnion('20'),
          logs: arrayUnion({ id: Date.now().toString(), message: `${playerName}がファイル#20のセキュリティロックを解除しました！` })
        });
        setInput('');
        setError('');
        setShowKeyRiddle(false);
      } else {
        setError('アクセス拒否：ロックキーが一致しません');
      }
    } else {
      setError('システムエラー：入力回路に激しいノイズが発生しています。デコードコンソールを使用してください。');
    }
  };

  const displayImg = isKeyUnlocked ? "riddle_20.png" : "riddle_20-lock.png";

  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-[70] backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-gray-900 border-2 border-amber-800 rounded-lg max-w-4xl w-full p-6 shadow-[0_0_30px_rgba(245,158,11,0.2)] flex flex-col max-h-[95vh] animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-amber-500 animate-pulse">⚠️</span>
            <h2 className="text-xl font-bold text-amber-500 tracking-widest">SYSTEM FILE #20</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl p-1">&times;</button>
        </div>

        <div className="bg-black rounded border border-gray-700 mb-4 flex-grow relative h-[50vh] sm:h-[60vh] flex items-center justify-center overflow-hidden">
          {showKeyRiddle ? (
            <div className="absolute inset-0 z-20 bg-black flex flex-col">
              <div className="p-2 bg-amber-950/40 border-b border-amber-800/50 text-[11px] text-amber-400 flex justify-between items-center shrink-0">
                <span>🔒 SECURITY_LOCK_KEY.PNG</span>
                <button onClick={() => setShowKeyRiddle(false)} className="px-2 py-0.5 bg-gray-800 rounded hover:bg-gray-700">&times; 閉じる</button>
              </div>
              <div className="flex-grow relative flex items-center justify-center overflow-hidden">
                <img src="/images/riddle_20-key.png" alt="解除用キーの謎" className="max-w-full max-h-full object-contain absolute z-10" onError={(e) => e.target.style.display = 'none'} />
                <div className="text-amber-500 text-xs text-center z-0">
                  <span>[解除用の謎 riddle_20-key.png]</span>
                </div>
              </div>
            </div>
          ) : null}

          <img 
            src={`/images/${displayImg}`} 
            alt="謎 20" 
            className="max-w-full max-h-full object-contain absolute z-10" 
            onError={(e) => e.target.style.display = 'none'} 
          />
          <div className="text-gray-500 flex flex-col items-center justify-center h-full w-full absolute top-0 left-0 z-0">
            <span>[{isKeyUnlocked ? "本来の謎" : "ロック画像"}]</span>
            <span className="text-xs mt-2">public/images/{displayImg}</span>
          </div>
        </div>

        <div className="shrink-0">
          {!isKeyUnlocked && (
            <button 
              onClick={() => setShowKeyRiddle(true)}
              className="w-full py-2 mb-4 bg-amber-900/40 hover:bg-amber-900/60 border border-amber-700 rounded text-amber-400 text-sm font-bold transition-all shadow-[0_0_5px_rgba(245,158,11,0.2)]"
            >
              🔑 セキュリティ解除用のデータ (riddle_20-key.png) を展開
            </button>
          )}

          {isSolved ? (
            <div className="text-center py-4 bg-blue-900/30 border border-blue-500 rounded text-blue-300 font-bold tracking-widest text-2xl shadow-[0_0_15px_#3b82f6]">正解 / CLEAR</div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              {isKeyUnlocked && (
                <div className="p-3 bg-red-950/20 border border-red-900/40 rounded text-xs text-red-400/90 leading-relaxed text-center animate-pulse">
                  【警告】入力端子バグ：解析エラー0x882 (デコードコンソールを用いて修正を適用してください)
                </div>
              )}
              <input 
                type="text" 
                value={input} 
                onChange={(e) => {setInput(e.target.value); setError('');}} 
                placeholder={isKeyUnlocked ? "バグのため、ひらがな入力が無効化されています" : "セキュリティ解除キー(ひらがな)を入力..."} 
                disabled={isKeyUnlocked} 
                className="w-full p-3 bg-black border border-amber-800 text-white rounded text-center text-lg focus:outline-none focus:border-amber-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:border-red-900" 
                autoFocus 
              />
              {error && <p className="text-red-400 text-xs text-center font-bold">{error}</p>}
              {!isKeyUnlocked && (
                <button type="submit" className="w-full p-3 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded transition-colors shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                  解除コード送信 / UNLOCK
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 21問目（LAST STEP）専用の最終解答ポップアップ
// ==========================================
function Puzzle21Modal({ puzzleId, isSolved, onClose, gameState, playerName, docRef }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [confirmAns, setConfirmAns] = useState(null); 

  const onSubmit = (e) => {
    e.preventDefault();
    if (!/^[ぁ-んー]+$/.test(input)) return setError('ひらがなのみで入力してください。');
    setConfirmAns(input);
  };

  const executeSubmit = async () => {
    await updateDoc(docRef, {
      finalAnswer: confirmAns,
      solvedPuzzles: arrayUnion(puzzleId),
      logs: arrayUnion({ id: Date.now().toString(), message: `${playerName}が最終解答「${confirmAns}」を送信しました。` })
    });
    onClose();
  };

  const decodeRule = DECODED_ANSWERS[puzzleId];
  const isDecoded = decodeRule && gameState.appliedGimmicks?.includes(decodeRule.req);
  const displayImg = isDecoded ? `riddle_${String(puzzleId).padStart(2, '0')}-new.png` : `riddle_${String(puzzleId).padStart(2, '0')}.png`;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[70] backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-gray-900 border border-yellow-500 rounded-lg max-w-4xl w-full p-6 shadow-[0_0_30px_rgba(234,179,8,0.3)] flex flex-col max-h-[95vh] animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 border-b border-yellow-700 pb-2 shrink-0">
          <h2 className="text-xl font-bold text-yellow-500 tracking-widest">FINAL FILE #21</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl p-1">&times;</button>
        </div>
        
        <div className="bg-black rounded border border-yellow-700/50 mb-6 flex-grow relative h-[50vh] sm:h-[60vh] flex items-center justify-center overflow-hidden">
          <img 
            src={`/images/${displayImg}`} 
            alt={`謎 ${puzzleId}`} 
            className="max-w-full max-h-full object-contain absolute z-10" 
            onError={(e) => e.target.style.display = 'none'} 
          />
          <div className="text-gray-500 flex flex-col items-center justify-center h-full w-full absolute top-0 left-0 z-0">
            <span>[画像未設定]</span>
            <span className="text-xs mt-2">public/images/{displayImg}</span>
          </div>
        </div>

        <div className="shrink-0">
          {isSolved ? (
            <div className="text-center py-4 bg-yellow-900/30 border border-yellow-500 rounded text-yellow-300 font-bold tracking-widest text-2xl shadow-[0_0_15px_rgba(234,179,8,0.5)]">
              最終解答 送信済
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <input type="text" value={input} onChange={(e) => {setInput(e.target.value); setError('');}} placeholder="最終解答(ひらがな)を入力..." className="w-full p-3 bg-black border border-yellow-800 text-white rounded text-center text-lg focus:outline-none focus:border-yellow-400" autoFocus />
              {error && <p className="text-red-400 text-sm text-center">{error}</p>}
              <button type="submit" className="w-full p-3 bg-yellow-700 hover:bg-yellow-600 text-black font-bold rounded transition-colors shadow-[0_0_10px_rgba(234,179,8,0.3)] hover:scale-105">
                最終解答を送信 / SUBMIT
              </button>
            </form>
          )}
        </div>

        {confirmAns && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md rounded-lg p-4">
            <div className="bg-gray-900 border-4 border-red-600 p-8 rounded-lg max-w-md w-full text-center shadow-[0_0_50px_rgba(220,38,38,0.8)] animate-fade-in">
              <h3 className="text-red-500 font-black text-3xl sm:text-4xl mb-6 animate-pulse tracking-widest">【 警 告 】</h3>
              <p className="text-white font-bold mb-4 text-lg sm:text-xl leading-relaxed">
                送信した時点で<br/><span className="text-red-400">全員の画面に反映</span>されます。
              </p>
              <p className="text-gray-300 text-sm sm:text-base mb-6 border-t border-gray-700 pt-4">
                この操作は一度やったら戻れません。<br/>全員の許可を得ましたか？
              </p>
              <div className="mb-8 p-4 bg-black border border-yellow-600 rounded">
                <span className="text-gray-400 text-xs block mb-1">送信する最終解答</span>
                <span className="text-yellow-400 font-bold text-2xl tracking-widest">{confirmAns}</span>
              </div>
              <div className="flex gap-4 sm:gap-6">
                <button onClick={executeSubmit} className="flex-1 bg-red-700 hover:bg-red-500 text-white font-bold py-3 sm:py-4 rounded text-lg sm:text-xl transition-all shadow-[0_0_15px_#b91c1c] hover:scale-105">はい</button>
                <button onClick={() => setConfirmAns(null)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 sm:py-4 rounded text-lg sm:text-xl transition-colors">いいえ</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// DECODE CONSOLE パネル (デコードコンソール)
// ==========================================
function DecoderPanel({ solvedCount, docRef, gameState, playerName }) {
  const [leftInput, setLeftInput] = useState('');
  const [rightInput, setRightInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [usedIndices, setUsedIndices] = useState([]);

  const unlockedCount = Math.floor(solvedCount / 2);
  const nextCard = unlockedCount < KATAKANA_CHARS.length ? KATAKANA_CHARS[unlockedCount] : null;

  const appliedCount = gameState.appliedGimmicks?.length || 0;
  const isMaxDecoded = appliedCount >= 11;

  const applyGimmick = async () => {
    setErrorMsg('');
    const num = parseInt(leftInput, 10);
    
    if (isNaN(num) || num < 1 || num > TOTAL_PUZZLES || leftInput.length !== 2) {
      setErrorMsg('不正な数値です');
      return;
    }

    const expectedValue = VALID_DECODES[leftInput];
    if (!expectedValue || expectedValue !== rightInput) {
      setErrorMsg('リストにありません'); 
      return;
    }

    const gimmickStr = `${leftInput}-${rightInput}`;

    if (gameState.appliedGimmicks?.includes(gimmickStr)) {
      setErrorMsg('既にそのデコードは適用されています。');
      return;
    }

    const logEntry = { id: Date.now().toString(), message: `DECODE: [${leftInput}] に [${rightInput}] をデコード適用しました！` };

    await updateDoc(docRef, {
      appliedGimmicks: arrayUnion(gimmickStr),
      logs: arrayUnion(logEntry)
    });

    setLeftInput('');
    setRightInput('');
    setUsedIndices([]); 
  };

  const addChar = (char, idx) => {
    if (rightInput.length < 11 && !usedIndices.includes(idx)) {
      setRightInput(prev => prev + char);
      setUsedIndices(prev => [...prev, idx]); 
    }
  };

  const clearRightInput = () => {
    setRightInput('');
    setUsedIndices([]); 
  };

  return (
    <div className="w-full bg-gray-900 border border-blue-900 rounded-lg p-6 shadow-[0_0_20px_rgba(59,130,246,0.15)] mt-4 relative overflow-hidden">
      
      {isMaxDecoded && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
           <div className="text-center px-4 animate-fade-in">
             <div className="text-gray-400 text-5xl mb-4">🔒</div>
             <p className="text-gray-300 font-bold tracking-widest text-xl">もうこれ以上使うことはありません</p>
           </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-blue-400 font-bold tracking-widest text-sm">{" >> DECODE CONSOLE (デコードコンソール) "}</h3>
        {nextCard && (
          <div className="text-blue-300 font-bold text-xs bg-blue-900/40 px-3 py-1 rounded border border-blue-500/50 animate-pulse shadow-[0_0_5px_rgba(59,130,246,0.5)]">
            Next Card: <span className="text-white text-sm ml-1">{nextCard}</span>
          </div>
        )}
      </div>
      
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 bg-black/50 p-4 rounded border border-gray-800 mb-6">
        <div className="flex items-center gap-2 text-lg font-bold">
          <input 
            type="text" 
            maxLength={2}
            value={leftInput}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, ''); 
              setLeftInput(val);
              setErrorMsg('');
            }}
            placeholder="00" 
            className="w-14 p-2 bg-gray-900 border border-blue-800 text-center text-blue-400 rounded focus:outline-none focus:border-blue-400 font-mono text-xl"
          />
          <span className="text-gray-400 text-sm sm:text-base">に</span>
          
          <div className="w-40 h-12 px-3 py-2 bg-gray-900 border border-blue-800 text-center text-green-400 rounded font-mono text-xl flex items-center justify-center relative overflow-hidden shrink-0">
            {rightInput || <span className="text-gray-600 text-sm select-none">デコード</span>}
          </div>
          <span className="text-gray-400 text-sm sm:text-base">を適用する。</span>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={clearRightInput}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded font-bold text-sm transition-colors cursor-pointer"
          >
            消去
          </button>
          
          <button 
            onClick={applyGimmick}
            className="px-6 py-2 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded text-sm transition-all shadow-[0_0_10px_rgba(59,130,246,0.3)] hover:scale-105"
          >
            適用 / APPLY
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="text-center text-red-500 font-bold mb-4 animate-pulse">
          ⚠️ {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-6 sm:grid-cols-11 gap-2">
        {Array.from({ length: 11 }).map((_, idx) => {
          const isUnlocked = idx < unlockedCount;
          const char = KATAKANA_CHARS[idx];
          const isUsed = usedIndices.includes(idx); 

          return isUnlocked ? (
            <button
              key={idx}
              onClick={() => addChar(char, idx)}
              disabled={isUsed}
              className={`aspect-square border font-bold text-lg rounded flex flex-col items-center justify-center transition-all shadow-[0_0_10px_rgba(59,130,246,0.2)] 
                ${isUsed 
                  ? 'bg-blue-900/20 border-blue-900/50 text-blue-800 cursor-not-allowed opacity-50' 
                  : 'bg-blue-950/40 border-blue-500 text-blue-300 hover:bg-blue-900 hover:text-white hover:scale-105 active:scale-95 cursor-pointer'}`}
            >
              <span className={`text-[9px] mb-0.5 ${isUsed ? 'text-blue-900' : 'text-blue-500/80'}`}>#{idx + 1}</span>
              {char}
            </button>
          ) : (
            <div
              key={idx}
              className="aspect-square bg-gray-950 border border-gray-800 text-gray-700 rounded flex flex-col items-center justify-center select-none shadow-inner"
            >
              <span className="text-base text-gray-800">🔒</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 説明書き拡大ポップアップ
function ExplainModal({ explainId, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-2 sm:p-8 z-[80] backdrop-blur-md" onClick={onClose}>
      <div className="relative max-w-4xl w-full h-full flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-0 right-0 sm:-right-8 text-gray-400 hover:text-white text-4xl p-2 z-10">&times;</button>
        <div className="bg-black border border-gray-600 rounded-lg overflow-hidden relative w-full h-[80vh] flex items-center justify-center shadow-[0_0_50px_rgba(0,0,0,0.8)]">
          <img src={`/images/explain_${explainId}.png`} alt={`説明 ${explainId} 拡大`} className="w-full h-full object-contain absolute inset-0 z-10" onError={(e) => e.target.style.display = 'none'} />
          <div className="text-gray-500 flex flex-col items-center z-0"><span>[説明画像 未設定]</span><span className="text-xs mt-2">public/images/explain_{explainId}.png</span></div>
        </div>
        <p className="text-gray-400 mt-4 text-sm animate-pulse">背景をクリックして閉じる</p>
      </div>
    </div>
  );
}

// ==========================================
// 管理者画面
// ==========================================
function AdminBoard({ gameState, docRef, initialGameState }) {
  const resetTimerRef = useRef(null);
  const [resetProgress, setResetProgress] = useState(0);
  
  const resetFinalTimerRef = useRef(null);
  const [resetFinalProgress, setResetFinalProgress] = useState(0);

  const activePlayers = gameState.players ? Object.values(gameState.players) : [];

  const toggleTimer = async () => {
    if (gameState.timer.isRunning) {
      const elapsed = Date.now() - gameState.timer.startTime;
      await updateDoc(docRef, { 'timer.isRunning': false, 'timer.remainingTime': Math.max(0, gameState.timer.remainingTime - elapsed) });
    } else {
      await updateDoc(docRef, { 'timer.isRunning': true, 'timer.startTime': Date.now() });
    }
  };

  const resetTimer = async () => await updateDoc(docRef, { 'timer.isRunning': false, 'timer.remainingTime': LIMIT_TIME_MINUTES * 60 * 1000 });
  const setStep = async (step) => { if (confirm(`本当に STEP ${step} を解放しますか？`)) await updateDoc(docRef, { currentStep: step }); };

  const handleResetMousedown = () => {
    let count = 0;
    resetTimerRef.current = setInterval(() => {
      count += 5; setResetProgress(count);
      if (count >= 100) {
        clearInterval(resetTimerRef.current);
        setDoc(docRef, initialGameState); setResetProgress(0);
      }
    }, 50);
  };
  const handleResetMouseup = () => { clearInterval(resetTimerRef.current); setResetProgress(0); };

  const handleResetFinalMousedown = () => {
    let count = 0;
    resetFinalTimerRef.current = setInterval(() => {
      count += 5; setResetFinalProgress(count);
      if (count >= 100) {
        clearInterval(resetFinalTimerRef.current);
        const newSolved = gameState.solvedPuzzles.filter(p => p !== 21);
        updateDoc(docRef, { finalAnswer: null, solvedPuzzles: newSolved });
        setResetFinalProgress(0);
      }
    }, 50);
  };
  const handleResetFinalMouseup = () => { clearInterval(resetFinalTimerRef.current); setResetFinalProgress(0); };

  const totalSolvedAndKeys = gameState.solvedPuzzles.length + (gameState.unlockedKeys?.includes('20') ? 1 : 0);

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col gap-8 relative z-10">
      
      {gameState.finalAnswer && (
        <div className="bg-yellow-900/30 border border-yellow-500 rounded-lg p-6 shadow-[0_0_15px_rgba(234,179,8,0.3)] animate-pulse">
          <h3 className="text-xl font-bold text-yellow-500 mb-2">送信された最終解答 (FILE #21)</h3>
          <p className="text-4xl text-white font-bold tracking-widest">{gameState.finalAnswer}</p>
        </div>
      )}

      {/* オンラインプレイヤー表示パネル */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
        <h3 className="text-xl font-bold text-gray-300 mb-4 border-b border-gray-700 pb-2 flex items-center justify-between">
          <span>接続中のプレイヤー</span>
          <span className="text-blue-400">{activePlayers.length} 名</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          {activePlayers.length > 0 ? (
            activePlayers.map((pName, i) => (
              <span key={i} className="px-3 py-1 bg-blue-900/40 border border-blue-500/50 rounded-full text-blue-200 text-sm shadow-[0_0_5px_rgba(59,130,246,0.2)]">
                {pName}
              </span>
            ))
          ) : (
            <p className="text-gray-500 text-sm">現在プレイヤーはいません</p>
          )}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
        <h3 className="text-xl font-bold text-gray-300 mb-4 border-b border-gray-700 pb-2 flex items-center justify-between">
          <span>現在の進捗</span>
        </h3>
        <div className="flex items-center justify-between mb-4">
          <div className="text-4xl text-blue-400 font-bold">{gameState.solvedPuzzles.length} <span className="text-lg text-gray-500">/ {TOTAL_PUZZLES} 解除済</span></div>
          <div className="text-xl text-yellow-500 font-bold">現在のフェーズ: STEP {gameState.currentStep === 3 ? 'LAST' : gameState.currentStep}</div>
        </div>
        <div className="text-xs text-gray-500 mb-4">
          ※ 20問目ロック解除フラグ：{gameState.unlockedKeys?.includes('20') ? '🔓解除済み' : '🔒ロック中'} (カタカナ解放にカウントされます：現在合計 {totalSolvedAndKeys} 個)
        </div>
        <div className="grid grid-cols-10 gap-1 sm:gap-2 mt-4 p-4 bg-black rounded border border-gray-800">
          {Array.from({ length: TOTAL_PUZZLES }, (_, i) => i + 1).map(id => {
            const isSolved = gameState.solvedPuzzles.includes(id);
            const isKeyUnlocked = id === 20 && gameState.unlockedKeys?.includes('20');
            return (
              <div 
                key={id} 
                className={`aspect-square rounded-sm transition-colors duration-500 flex items-center justify-center text-[10px] font-bold
                  ${isSolved ? 'bg-blue-500 shadow-[0_0_8px_#3b82f6] text-white' : (isKeyUnlocked ? 'bg-amber-600/70 text-amber-100 border border-amber-500' : 'bg-gray-800 text-gray-600')}`} 
                title={`謎 ${id}`}
              >
                {id}
              </div>
            );
          })}
        </div>
      </div>

      {/* 適用済みデコード表示 */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
        <h3 className="text-xl font-bold text-gray-300 mb-4 border-b border-gray-700 pb-2">適用されたデコード</h3>
        <div className="flex flex-wrap gap-2">
          {gameState.appliedGimmicks && gameState.appliedGimmicks.length > 0 ? (
            gameState.appliedGimmicks.map((gStr, i) => (
              <span key={i} className="px-3 py-1 bg-green-950/50 border border-green-500 rounded text-green-300 text-xs font-mono">
                [{gStr.split('-')[0]}] ➡ {gStr.split('-')[1]}
              </span>
            ))
          ) : (
            <p className="text-gray-500 text-sm">適用されたデコードはまだありません</p>
          )}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
        <h3 className="text-xl font-bold text-gray-300 mb-4 border-b border-gray-700 pb-2">タイマー制御</h3>
        <div className="flex gap-4">
          <button onClick={toggleTimer} className={`flex-1 py-4 font-bold rounded ${gameState.timer.isRunning ? 'bg-yellow-600 hover:bg-yellow-500 text-yellow-900' : 'bg-green-700 hover:bg-green-600 text-white'}`}>{gameState.timer.isRunning ? '⏸ 進行中 (一時停止する)' : '▶ 停止中 (スタートする)'}</button>
          <button onClick={resetTimer} className="px-6 bg-gray-700 hover:bg-gray-600 font-bold rounded">30分にリセット</button>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
        <h3 className="text-xl font-bold text-gray-300 mb-4 border-b border-gray-700 pb-2">フェーズ強制進行 (ダブルチェックあり)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3].map(step => (
            <button key={step} onClick={() => setStep(step)} className={`py-3 font-bold border rounded ${gameState.currentStep === step ? 'bg-blue-900 border-blue-500 text-white' : 'bg-black border-gray-700 text-gray-500 hover:border-gray-400'}`}>
              {step === 3 ? 'LAST STEPへ' : `STEP ${step} へ`}
            </button>
          ))}
        </div>
        <h3 className="text-xl font-bold text-gray-300 mt-8 mb-4 border-b border-gray-700 pb-2">エンディング分岐</h3>
        <div className="flex gap-4">
          <button onClick={() => setStep(5)} className="flex-1 py-4 bg-purple-900 hover:bg-purple-800 border border-purple-500 font-bold rounded shadow-[0_0_10px_#a855f7]">エンディング A を再生</button>
          <button onClick={() => setStep(6)} className="flex-1 py-4 bg-indigo-900 hover:bg-indigo-800 border border-indigo-500 font-bold rounded shadow-[0_0_10px_#6366f1]">エンディング B を再生</button>
        </div>
      </div>

      <div className="bg-red-900/20 border border-red-900 rounded-lg p-6 mt-8 flex flex-col items-center">
        <h3 className="text-red-500 font-bold mb-2">DANGER ZONE</h3>
        <p className="text-gray-400 text-sm mb-4">進行状況・ログを含めた全てのデータを初期化します。</p>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
          <button onMouseDown={handleResetMousedown} onMouseUp={handleResetMouseup} onMouseLeave={handleResetMouseup} onTouchStart={handleResetMousedown} onTouchEnd={handleResetMouseup} className="relative overflow-hidden px-10 py-4 bg-black border border-red-700 text-red-500 font-bold rounded select-none active:scale-95 transition-transform">
            <div className="relative z-10">長押しで全リセット</div><div className="absolute left-0 top-0 bottom-0 bg-red-800 opacity-50 transition-all duration-75" style={{ width: `${resetProgress}%` }} />
          </button>
          
          <button onMouseDown={handleResetFinalMousedown} onMouseUp={handleResetFinalMouseup} onMouseLeave={handleResetFinalMouseup} onTouchStart={handleResetFinalMousedown} onTouchEnd={handleResetFinalMouseup} className="relative overflow-hidden px-10 py-4 bg-black border border-yellow-700 text-yellow-500 font-bold rounded select-none active:scale-95 transition-transform">
            <div className="relative z-10">長押しで最終解答をリセット</div><div className="absolute left-0 top-0 bottom-0 bg-yellow-800 opacity-50 transition-all duration-75" style={{ width: `${resetFinalProgress}%` }} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// トースト通知
// ==========================================
function ToastContainer({ logs }) {
  const [toasts, setToasts] = useState([]);
  const previousLogsRef = useRef([]);
  useEffect(() => {
    if (!logs) return;
    const newLogs = logs.filter(newLog => !previousLogsRef.current.some(prevLog => prevLog.id === newLog.id));
    if (newLogs.length > 0) {
      setToasts(prev => [...prev, ...newLogs]);
      newLogs.forEach(log => { setTimeout(() => { setToasts(current => current.filter(t => t.id !== log.id)); }, 5000); });
    }
    previousLogsRef.current = logs;
  }, [logs]);

  return (
    <div className="fixed bottom-4 left-4 z-[80] flex flex-col-reverse gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div key={toast.id} className="bg-black/80 border-l-4 border-blue-500 text-blue-100 px-4 py-3 rounded shadow-[0_0_10px_rgba(59,130,246,0.2)] backdrop-blur-sm animate-fade-in-up">
          <span className="text-blue-400 mr-2">ℹ</span>{toast.message}
        </div>
      ))}
    </div>
  );
}

// ==========================================
// エンディング画面
// ==========================================
function EndingScreen({ type }) {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <div className={`text-4xl md:text-6xl font-bold tracking-[0.2em] mb-8 ${type === 'A' ? 'text-purple-500 shadow-[0_0_30px_#a855f7]' : 'text-indigo-500 shadow-[0_0_30px_#6366f1]'}`}>ENDING {type}</div>
      <p className="text-gray-400 text-center max-w-2xl leading-loose">
        {type === 'A' ? "ここにトゥルーエンドのストーリーテキストや動画を配置します。サイバー空間からの脱出に成功しました。" : "ここにノーマルエンドのストーリーテキストや動画を配置します。システムはシャットダウンされました。"}
      </p>
    </div>
  );
}