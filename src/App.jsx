import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';

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
const appId = typeof __app_id !== 'undefined' ? __app_id : 'cyber-enigma-app';

// データベースの保存先パス（Rule 1準拠: パブリックデータとして全体共有する）
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main');

// ゲームの初期状態
const initialGameState = {
  currentStep: 1, // 1:Step1, 2:Step2, 3:Step3, 4:Last, 5:EndA, 6:EndB
  solvedPuzzles: [], // 解かれた謎の番号が入る配列
  timer: {
    isRunning: false,
    startTime: 0,
    remainingTime: 45 * 60 * 1000, // 45分 (ミリ秒)
  },
  logs: [] // 通知用の履歴
};

export default function App() {
  const [user, setUser] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLogged, setIsLogged] = useState(false);

  // --- 1. 認証とデータベースの同期 ---
  useEffect(() => {
    // サイバー風のデジタル時計フォントを読み込み
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    // 匿名ログイン（Rule 3準拠）
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
    if (!user) return; // ログイン完了まで待つ

    // データベースの変更をリアルタイムで監視（リスナー）
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setGameState(docSnap.data());
      } else {
        // データがまだなければ初期化
        setDoc(docRef, initialGameState);
      }
    }, (error) => console.error(error));

    return () => unsub();
  }, [user]);

  // --- 2. ログイン処理 ---
  const handleLogin = (e) => {
    e.preventDefault();
    const inputVal = e.target.name.value;
    if (!inputVal) return;
    
    // パスワードが入力された場合は管理者としてログイン
    if (inputVal === '4hS9nt') {
      setPlayerName('管理者');
      setIsAdmin(true);
    } else {
      setPlayerName(inputVal);
      setIsAdmin(false);
    }
    setIsLogged(true);
  };

  const handleLogout = () => {
    setIsLogged(false);
    setPlayerName('');
    setIsAdmin(false);
  };

  // --- 3. 画面の切り替え ---
  if (!isLogged) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (!gameState) {
    return <div className="min-h-screen bg-gray-950 text-blue-400 flex items-center justify-center">システムに接続中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans overflow-hidden relative">
      {/* 共通のヘッダー＆タイマー */}
      <Header timer={gameState.timer} currentStep={gameState.currentStep} isAdmin={isAdmin} playerName={playerName} onLogout={handleLogout} />

      {/* メイン画面の分岐 */}
      {isAdmin ? (
        <AdminBoard gameState={gameState} docRef={docRef} initialGameState={initialGameState} />
      ) : (
        <PlayerBoard gameState={gameState} docRef={docRef} playerName={playerName} />
      )}

      {/* プレイヤー用の共有アイテム欄（Step3ギミック用・Step2までロック） */}
      {!isAdmin && <ItemDrawer solvedCount={gameState.solvedPuzzles.length} currentStep={gameState.currentStep} />}

      {/* 左下のトースト通知 */}
      <ToastContainer logs={gameState.logs} />

      {/* プレイヤー向け：タイマー停止時のロック画面 */}
      {!isAdmin && !gameState.timer.isRunning && gameState.currentStep < 5 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto">
          <div className="text-center p-8 bg-gray-900/80 border border-blue-900 rounded-lg shadow-[0_0_30px_rgba(59,130,246,0.2)]">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-300 tracking-widest mb-4">SYSTEM PAUSED</h2>
            <p className="text-blue-400 animate-pulse text-lg">再開までしばらくお待ちください...</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// ログイン画面コンポーネント
// ==========================================
function LoginScreen({ onLogin }) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="bg-gray-900 p-8 rounded-lg border border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)] w-full max-w-md">
        <h1 className="text-3xl font-bold text-center text-blue-400 mb-8 tracking-widest">CYBER ENIGMA</h1>
        
        <form onSubmit={onLogin} className="flex flex-col gap-4">
          <p className="text-gray-400 text-sm text-center">アクセスコード（名前）を入力してください</p>
          <input name="name" type="text" required placeholder="ニックネーム" className="p-3 bg-black border border-blue-800 text-white rounded focus:outline-none focus:border-blue-400" />
          <button type="submit" className="mt-4 p-3 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold transition-all shadow-[0_0_10px_#2563eb]">
            システムに接続
          </button>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// ヘッダー＆タイマー コンポーネント
// ==========================================
function Header({ timer, currentStep, isAdmin, playerName, onLogout }) {
  const [displayTime, setDisplayTime] = useState(timer.remainingTime);

  // タイマーのカウントダウン処理
  useEffect(() => {
    let interval;
    if (timer.isRunning) {
      interval = setInterval(() => {
        const now = Date.now();
        const elapsed = now - timer.startTime;
        const currentRemaining = Math.max(0, timer.remainingTime - elapsed);
        setDisplayTime(currentRemaining);
      }, 100);
    } else {
      setDisplayTime(timer.remainingTime);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const m = Math.floor(displayTime / 60000).toString().padStart(2, '0');
  const s = Math.floor((displayTime % 60000) / 1000).toString().padStart(2, '0');
  
  if (currentStep === 5 || currentStep === 6) return null; 

  return (
    <div className="w-full bg-black border-b border-blue-900 p-4 flex items-center justify-between shadow-lg relative z-[60]">
      <div className="text-blue-500 font-bold tracking-widest hidden sm:block flex-1">
        {isAdmin ? '>> ADMIN CONSOLE' : '>> PLAYER TERMINAL'}
      </div>
      
      <div className="absolute left-1/2 transform -translate-x-1/2">
        <div 
          className={`text-4xl sm:text-5xl bg-gray-900 px-6 py-2 rounded-lg border-2 shadow-[0_0_15px_rgba(239,68,68,0.2)] transition-colors duration-300
            ${timer.isRunning ? 'text-red-500 border-red-900' : 'text-gray-500 border-gray-700'}`}
          style={{ fontFamily: "'Orbitron', sans-serif" }}
        >
          {m}:{s}
      </div>
      </div>
      
      <div className="flex items-center justify-end gap-4 flex-1">
        <div className="text-gray-400 font-bold text-xl hidden sm:block">
          {currentStep === 4 ? 'LAST STEP' : `STEP ${currentStep}`}
        </div>
        <button 
          onClick={onLogout}
          className="px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 transition-colors relative z-[60]"
          title="クリックでログアウト"
        >
          {playerName} (切断)
        </button>
      </div>
    </div>
  );
}

// ==========================================
// プレイヤー画面 コンポーネント
// ==========================================
function PlayerBoard({ gameState, docRef, playerName }) {
  const [activePuzzle, setActivePuzzle] = useState(null);
  const [activeExplain, setActiveExplain] = useState(null);

  if (gameState.currentStep === 5) return <EndingScreen type="A" />;
  if (gameState.currentStep === 6) return <EndingScreen type="B" />;

  // 進行に応じた謎の配列
  let puzzlesToShow = [];
  if (gameState.currentStep >= 1) puzzlesToShow = [...puzzlesToShow, ...Array.from({length: 20}, (_, i) => i + 1)]; // 1~20
  if (gameState.currentStep >= 2) puzzlesToShow = [...puzzlesToShow, ...Array.from({length: 10}, (_, i) => i + 21)]; // 21~30
  if (gameState.currentStep >= 3) puzzlesToShow = [...puzzlesToShow, ...Array.from({length: 19}, (_, i) => i + 31)]; // 31~49
  if (gameState.currentStep >= 4) puzzlesToShow = [...puzzlesToShow, 50]; // 50

  // 進行に応じた説明書きの配列（Stepに応じて増えていく想定）
  let explainsToShow = [];
  if (gameState.currentStep >= 1) explainsToShow.push('01'); // Step1の説明書
  if (gameState.currentStep >= 2) explainsToShow.push('02'); // Step2の説明書（必要に応じて増減可能）
  if (gameState.currentStep >= 3) explainsToShow.push('03'); 
  if (gameState.currentStep >= 4) explainsToShow.push('04');

  const handleSolve = async (puzzleId) => {
    const logMsg = `${playerName}が謎${puzzleId}を解除しました。`;
    const logEntry = { id: Date.now().toString(), message: logMsg };

    await updateDoc(docRef, {
      solvedPuzzles: arrayUnion(puzzleId),
      logs: arrayUnion(logEntry)
    });
    setActivePuzzle(null);
  };

  return (
    <div className="p-6 pb-32 max-w-6xl mx-auto">
      
      {/* 【追加】説明書き（プレビュー）エリア */}
      <div className="mb-6 border-b border-gray-800 pb-4">
        <h3 className="text-gray-500 text-sm font-bold mb-3 tracking-widest">DATA FILES (クリックで拡大)</h3>
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {explainsToShow.map(id => (
            <button
              key={id}
              onClick={() => setActiveExplain(id)}
              className="w-32 h-20 bg-gray-900 border border-gray-600 rounded cursor-pointer hover:border-blue-400 flex-shrink-0 relative overflow-hidden group shadow-[0_0_10px_rgba(0,0,0,0.5)] transition-colors"
            >
              <img 
                src={`/images/explain_${id}.png`} 
                alt={`説明 ${id}`} 
                className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                onError={(e) => e.target.style.display = 'none'} 
              />
              <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500 pointer-events-none group-hover:text-blue-400">
                explain_{id}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 謎解きボタンエリア */}
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
        {puzzlesToShow.map(id => {
          const isSolved = gameState.solvedPuzzles.includes(id);
          return (
            <button
              key={id}
              onClick={() => setActivePuzzle(id)}
              className={`aspect-square rounded flex items-center justify-center text-xl font-bold transition-all duration-300
                ${isSolved 
                  ? 'bg-blue-900/50 text-blue-300 border border-blue-400 shadow-[0_0_15px_#3b82f6]' 
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700' 
                }`}
            >
              {id}
            </button>
          );
        })}
      </div>

      {/* 謎解き入力モーダル */}
      {activePuzzle !== null && (
        <PuzzleModal 
          puzzleId={activePuzzle} 
          isSolved={gameState.solvedPuzzles.includes(activePuzzle)}
          onClose={() => setActivePuzzle(null)}
          onSolve={handleSolve}
        />
      )}

      {/* 【追加】説明書き 拡大表示モーダル */}
      {activeExplain !== null && (
        <ExplainModal 
          explainId={activeExplain} 
          onClose={() => setActiveExplain(null)} 
        />
      )}
    </div>
  );
}

// 謎を表示し、入力するポップアップ画面
function PuzzleModal({ puzzleId, isSolved, onClose, onSolve }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const onSubmit = (e) => {
    e.preventDefault();
    if (!/^[ぁ-ん]+$/.test(input)) {
      setError('ひらがなのみで入力してください。');
      return;
    }
    
    // 【重要】ここで正解判定を行います。今回はテストのためすべて「せいかい」で通します。
    if (input === 'せいかい') {
      onSolve(puzzleId);
    } else {
      setError('アクセス拒否：キーワードが一致しません');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[70] backdrop-blur-sm">
      <div className="bg-gray-900 border border-blue-500 rounded-lg max-w-lg w-full p-6 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
        <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
          <h2 className="text-xl font-bold text-blue-400">FILE #{puzzleId}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        {/* 謎の画像表示エリア */}
        <div className="bg-black aspect-video rounded border border-gray-700 flex items-center justify-center mb-6 overflow-hidden relative">
          <img 
            src={`/images/riddle_${String(puzzleId).padStart(2, '0')}.png`} 
            alt={`謎 ${puzzleId}`} 
            className="w-full h-full object-contain absolute inset-0 z-10"
            onError={(e) => e.target.style.display = 'none'}
          />
          <div className="text-gray-500 flex flex-col items-center z-0">
             <span>[画像未設定]</span>
             <span className="text-xs mt-2">public/images/riddle_{String(puzzleId).padStart(2, '0')}.png</span>
          </div>
        </div>

        {isSolved ? (
          <div className="text-center py-4 bg-blue-900/30 border border-blue-500 rounded text-blue-300 font-bold tracking-widest text-2xl shadow-[0_0_15px_#3b82f6]">
            正解 / CLEAR
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <input 
              type="text" 
              value={input}
              onChange={(e) => {setInput(e.target.value); setError('');}}
              placeholder="ひらがなで入力..." 
              className="w-full p-3 bg-black border border-blue-800 text-white rounded text-center text-lg focus:outline-none focus:border-blue-400"
              autoFocus
            />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button type="submit" className="w-full p-3 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded transition-colors">
              送信 / SUBMIT
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// 【追加】説明書きを拡大表示するポップアップ画面
function ExplainModal({ explainId, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-2 sm:p-8 z-[80] backdrop-blur-md" onClick={onClose}>
      <div className="relative max-w-4xl w-full h-full flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-0 right-0 sm:-right-8 text-gray-400 hover:text-white text-4xl p-2 z-10">&times;</button>
        <div className="bg-black border border-gray-600 rounded-lg overflow-hidden relative w-full h-[80vh] flex items-center justify-center shadow-[0_0_50px_rgba(0,0,0,0.8)]">
          <img 
            src={`/images/explain_${explainId}.png`} 
            alt={`説明 ${explainId} 拡大`} 
            className="w-full h-full object-contain absolute inset-0 z-10"
            onError={(e) => e.target.style.display = 'none'}
          />
          <div className="text-gray-500 flex flex-col items-center z-0">
             <span>[説明画像 未設定]</span>
             <span className="text-xs mt-2">public/images/explain_{explainId}.png</span>
          </div>
        </div>
        <p className="text-gray-400 mt-4 text-sm animate-pulse">背景をクリックして閉じる</p>
      </div>
    </div>
  );
}


// ==========================================
// 共有アイテム欄 コンポーネント (Step3用)
// ==========================================
function ItemDrawer({ solvedCount, currentStep }) {
  const [isOpen, setIsOpen] = useState(false);
  const itemCount = Math.floor(solvedCount / 5); // 5問正解ごとに1つ
  
  // 【追加】Step2になるまではロックする
  const isLocked = currentStep < 2;

  return (
    <div className={`fixed bottom-0 right-4 sm:right-10 w-64 bg-gray-900 border-t border-l border-r ${isLocked ? 'border-gray-700' : 'border-blue-500'} rounded-t-lg shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-transform duration-300 z-40 ${isOpen ? 'translate-y-0' : 'translate-y-[calc(100%-40px)]'}`}>
      <button 
        onClick={() => !isLocked && setIsOpen(!isOpen)} 
        disabled={isLocked}
        className={`w-full p-2 font-bold text-sm tracking-widest flex justify-between items-center transition-colors
          ${isLocked ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-blue-900/50 hover:bg-blue-800 text-blue-200'}`}
      >
        <span>INVENTORY</span>
        {/* ロック中は [LOCKED] と表示 */}
        <span>{isLocked ? '[LOCKED]' : `[${itemCount}] ▲`}</span>
      </button>
      <div className="p-4 h-48 overflow-y-auto bg-black/50">
        {itemCount === 0 || isLocked ? (
          <p className="text-gray-600 text-sm text-center mt-4">データがありません</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: itemCount }).map((_, i) => (
              <div key={i} className="bg-gray-800 border border-blue-400 rounded p-2 text-center text-xs text-blue-100 flex flex-col items-center justify-center aspect-square shadow-[0_0_5px_#3b82f6]">
                <span className="text-[10px] text-gray-400 mb-1">CARD #{i+1}</span>
                カタカナ
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 管理者画面 コンポーネント
// ==========================================
function AdminBoard({ gameState, docRef, initialGameState }) {
  const resetTimerRef = useRef(null);
  const [resetProgress, setResetProgress] = useState(0);

  // タイマー操作
  const toggleTimer = async () => {
    if (gameState.timer.isRunning) {
      const elapsed = Date.now() - gameState.timer.startTime;
      const newRemaining = Math.max(0, gameState.timer.remainingTime - elapsed);
      await updateDoc(docRef, { 'timer.isRunning': false, 'timer.remainingTime': newRemaining });
    } else {
      await updateDoc(docRef, { 'timer.isRunning': true, 'timer.startTime': Date.now() });
    }
  };

  const resetTimer = async () => {
    await updateDoc(docRef, { 'timer.isRunning': false, 'timer.remainingTime': 45 * 60 * 1000 });
  };

  const setStep = async (step) => {
    if (confirm(`本当に STEP ${step} を解放しますか？`)) {
      await updateDoc(docRef, { currentStep: step });
    }
  };

  const handleResetMousedown = () => {
    let count = 0;
    resetTimerRef.current = setInterval(() => {
      count += 5; 
      setResetProgress(count);
      if (count >= 100) {
        clearInterval(resetTimerRef.current);
        setDoc(docRef, initialGameState); 
        setResetProgress(0);
      }
    }, 50);
  };

  const handleResetMouseup = () => {
    clearInterval(resetTimerRef.current);
    setResetProgress(0);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col gap-8 relative z-10">
      
      {/* 進行状況パネル */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
        <h3 className="text-xl font-bold text-gray-300 mb-4 border-b border-gray-700 pb-2">現在の進捗</h3>
        <div className="flex items-center justify-between mb-4">
          <div className="text-4xl text-blue-400 font-bold">{gameState.solvedPuzzles.length} <span className="text-lg text-gray-500">/ 50 解除済</span></div>
          <div className="text-xl text-yellow-500 font-bold">現在のフェーズ: STEP {gameState.currentStep === 4 ? 'LAST' : gameState.currentStep}</div>
        </div>

        {/* 【追加】50問の進捗状況を小さな四角で表示するグリッド */}
        <div className="grid grid-cols-10 gap-1 sm:gap-2 mt-6 p-4 bg-black rounded border border-gray-800">
          {Array.from({ length: 50 }, (_, i) => i + 1).map(id => {
            const isSolved = gameState.solvedPuzzles.includes(id);
            return (
              <div 
                key={id}
                className={`aspect-square rounded-sm transition-colors duration-500 ${isSolved ? 'bg-blue-500 shadow-[0_0_8px_#3b82f6]' : 'bg-gray-800'}`}
                title={`謎 ${id} : ${isSolved ? '解除済' : '未解除'}`}
              />
            );
          })}
        </div>
      </div>

      {/* タイマー制御パネル */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
        <h3 className="text-xl font-bold text-gray-300 mb-4 border-b border-gray-700 pb-2">タイマー制御</h3>
        <div className="flex gap-4">
          <button onClick={toggleTimer} className={`flex-1 py-4 font-bold rounded ${gameState.timer.isRunning ? 'bg-yellow-600 hover:bg-yellow-500 text-yellow-900' : 'bg-green-700 hover:bg-green-600 text-white'}`}>
            {gameState.timer.isRunning ? '⏸ 進行中 (一時停止する)' : '▶ 停止中 (スタートする)'}
          </button>
          <button onClick={resetTimer} className="px-6 bg-gray-700 hover:bg-gray-600 font-bold rounded">
            45分にリセット
          </button>
        </div>
      </div>

      {/* 画面切り替えパネル */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
        <h3 className="text-xl font-bold text-gray-300 mb-4 border-b border-gray-700 pb-2">フェーズ強制進行 (ダブルチェックあり)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(step => (
            <button 
              key={step} 
              onClick={() => setStep(step)}
              className={`py-3 font-bold border rounded ${gameState.currentStep === step ? 'bg-blue-900 border-blue-500 text-white' : 'bg-black border-gray-700 text-gray-500 hover:border-gray-400'}`}
            >
              {step === 4 ? 'LAST STEPへ' : `STEP ${step} へ`}
            </button>
          ))}
        </div>
        
        <h3 className="text-xl font-bold text-gray-300 mt-8 mb-4 border-b border-gray-700 pb-2">エンディング分岐</h3>
        <div className="flex gap-4">
          <button onClick={() => setStep(5)} className="flex-1 py-4 bg-purple-900 hover:bg-purple-800 border border-purple-500 font-bold rounded shadow-[0_0_10px_#a855f7]">
            エンディング A を再生
          </button>
          <button onClick={() => setStep(6)} className="flex-1 py-4 bg-indigo-900 hover:bg-indigo-800 border border-indigo-500 font-bold rounded shadow-[0_0_10px_#6366f1]">
            エンディング B を再生
          </button>
        </div>
      </div>

      {/* 危険操作パネル */}
      <div className="bg-red-900/20 border border-red-900 rounded-lg p-6 mt-8 flex flex-col items-center">
        <h3 className="text-red-500 font-bold mb-2">DANGER ZONE</h3>
        <p className="text-gray-400 text-sm mb-4">進行状況・ログを含めた全てのデータを初期化します。</p>
        <button 
          onMouseDown={handleResetMousedown}
          onMouseUp={handleResetMouseup}
          onMouseLeave={handleResetMouseup}
          onTouchStart={handleResetMousedown}
          onTouchEnd={handleResetMouseup}
          className="relative overflow-hidden px-10 py-4 bg-black border border-red-700 text-red-500 font-bold rounded select-none active:scale-95 transition-transform"
        >
          <div className="relative z-10">長押しで全リセット</div>
          <div 
            className="absolute left-0 top-0 bottom-0 bg-red-800 opacity-50 transition-all duration-75"
            style={{ width: `${resetProgress}%` }}
          />
        </button>
      </div>
    </div>
  );
}

// ==========================================
// トースト通知 コンポーネント
// ==========================================
function ToastContainer({ logs }) {
  const [toasts, setToasts] = useState([]);
  const previousLogsRef = useRef([]);

  useEffect(() => {
    if (!logs) return;
    
    const newLogs = logs.filter(
      newLog => !previousLogsRef.current.some(prevLog => prevLog.id === newLog.id)
    );

    if (newLogs.length > 0) {
      setToasts(prev => [...prev, ...newLogs]);
      
      newLogs.forEach(log => {
        setTimeout(() => {
          setToasts(current => current.filter(t => t.id !== log.id));
        }, 5000);
      });
    }
    
    previousLogsRef.current = logs;
  }, [logs]);

  return (
    <div className="fixed bottom-4 left-4 z-[80] flex flex-col-reverse gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div key={toast.id} className="bg-black/80 border-l-4 border-blue-500 text-blue-100 px-4 py-3 rounded shadow-[0_0_10px_rgba(59,130,246,0.2)] backdrop-blur-sm animate-fade-in-up">
          <span className="text-blue-400 mr-2">ℹ</span>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

// ==========================================
// エンディング画面 コンポーネント
// ==========================================
function EndingScreen({ type }) {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <div className={`text-4xl md:text-6xl font-bold tracking-[0.2em] mb-8 ${type === 'A' ? 'text-purple-500 shadow-[0_0_30px_#a855f7]' : 'text-indigo-500 shadow-[0_0_30px_#6366f1]'}`}>
        ENDING {type}
      </div>
      <p className="text-gray-400 text-center max-w-2xl leading-loose">
        {type === 'A' 
          ? "ここにトゥルーエンドのストーリーテキストや動画を配置します。サイバー空間からの脱出に成功しました。"
          : "ここにノーマルエンドのストーリーテキストや動画を配置します。システムはシャットダウンされました。"}
      </p>
    </div>
  );
}