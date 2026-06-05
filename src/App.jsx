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
    <div className="min-h-screen bg-gray-950 text-white font-sans overflow-hidden">
      {/* 共通のヘッダー＆タイマー */}
      <Header timer={gameState.timer} currentStep={gameState.currentStep} isAdmin={isAdmin} playerName={playerName} onLogout={handleLogout} />

      {/* メイン画面の分岐 */}
      {isAdmin ? (
        <AdminBoard gameState={gameState} docRef={docRef} initialGameState={initialGameState} />
      ) : (
        <PlayerBoard gameState={gameState} docRef={docRef} playerName={playerName} />
      )}

      {/* プレイヤー用の共有アイテム欄（Step3ギミック用） */}
      {!isAdmin && <ItemDrawer solvedCount={gameState.solvedPuzzles.length} />}

      {/* 左下のトースト通知 */}
      <ToastContainer logs={gameState.logs} />
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
      }, 100); // 0.1秒ごとに更新して滑らかに
    } else {
      setDisplayTime(timer.remainingTime);
    }
    return () => clearInterval(interval);
  }, [timer]);

  // mm:ss 形式に変換
  const m = Math.floor(displayTime / 60000).toString().padStart(2, '0');
  const s = Math.floor((displayTime % 60000) / 1000).toString().padStart(2, '0');
  
  // エンディング時の表示
  if (currentStep === 5 || currentStep === 6) return null; 

  return (
    <div className="w-full bg-black border-b border-blue-900 p-4 flex items-center justify-between shadow-lg relative z-10">
      <div className="text-blue-500 font-bold tracking-widest hidden sm:block flex-1">
        {isAdmin ? '>> ADMIN CONSOLE' : '>> PLAYER TERMINAL'}
      </div>
      
      {/* 7セグメント風タイマー */}
      <div className="absolute left-1/2 transform -translate-x-1/2">
        <div 
          className="text-red-500 text-4xl sm:text-5xl bg-gray-900 px-6 py-2 rounded-lg border-2 border-red-900 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
          style={{ fontFamily: "'Orbitron', sans-serif" }}
        >
          {m}:{s}
      </div>
      </div>
      
      <div className="flex items-center justify-end gap-4 flex-1">
        <div className="text-gray-400 font-bold text-xl hidden sm:block">
          {currentStep === 4 ? 'LAST STEP' : `STEP ${currentStep}`}
        </div>
        {/* ログアウトボタン（名前表示） */}
        <button 
          onClick={onLogout}
          className="px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 transition-colors"
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

  // エンディングの表示
  if (gameState.currentStep === 5) return <EndingScreen type="A" />;
  if (gameState.currentStep === 6) return <EndingScreen type="B" />;

  // ステップに応じて表示するボタンの配列を生成
  let puzzlesToShow = [];
  if (gameState.currentStep >= 1) puzzlesToShow = [...puzzlesToShow, ...Array.from({length: 20}, (_, i) => i + 1)]; // 1~20
  if (gameState.currentStep >= 2) puzzlesToShow = [...puzzlesToShow, ...Array.from({length: 10}, (_, i) => i + 21)]; // 21~30
  if (gameState.currentStep >= 3) puzzlesToShow = [...puzzlesToShow, ...Array.from({length: 19}, (_, i) => i + 31)]; // 31~49
  if (gameState.currentStep >= 4) puzzlesToShow = [...puzzlesToShow, 50]; // 50

  const handleSolve = async (puzzleId) => {
    // 誰かが解いた時の通知メッセージ
    const logMsg = `${playerName}が謎${puzzleId}を解除しました。`;
    const logEntry = { id: Date.now().toString(), message: logMsg };

    // データベースを更新 (正解リストに追加＆ログを追加)
    await updateDoc(docRef, {
      solvedPuzzles: arrayUnion(puzzleId),
      logs: arrayUnion(logEntry)
    });
    setActivePuzzle(null); // モーダルを閉じる
  };

  return (
    <div className="p-6 pb-32 max-w-6xl mx-auto">
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
        {puzzlesToShow.map(id => {
          const isSolved = gameState.solvedPuzzles.includes(id);
          return (
            <button
              key={id}
              onClick={() => setActivePuzzle(id)}
              className={`aspect-square rounded flex items-center justify-center text-xl font-bold transition-all duration-300
                ${isSolved 
                  ? 'bg-blue-900/50 text-blue-300 border border-blue-400 shadow-[0_0_15px_#3b82f6]' // 解除済み（光る）
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700' // 未解除
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
    // 本番では if (input === ANSWERS[puzzleId]) のようにします。
    if (input === 'せいかい') {
      onSolve(puzzleId);
    } else {
      setError('アクセス拒否：キーワードが一致しません');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-gray-900 border border-blue-500 rounded-lg max-w-lg w-full p-6 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
        <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
          <h2 className="text-xl font-bold text-blue-400">FILE #{puzzleId}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        {/* 謎の画像表示エリア */}
        <div className="bg-black aspect-video rounded border border-gray-700 flex items-center justify-center mb-6 overflow-hidden relative">
          {/* 実際はここで <img src={`images/riddle_${String(puzzleId).padStart(2, '0')}.png`} /> のように読み込みます */}
          <div className="text-gray-500 flex flex-col items-center">
             <span>[画像プレースホルダー]</span>
             <span className="text-xs mt-2">riddle_{String(puzzleId).padStart(2, '0')}.png</span>
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

// ==========================================
// 共有アイテム欄 コンポーネント (Step3用)
// ==========================================
function ItemDrawer({ solvedCount }) {
  const [isOpen, setIsOpen] = useState(false);
  const itemCount = Math.floor(solvedCount / 5); // 5問正解ごとに1つ

  return (
    <div className={`fixed bottom-0 right-4 sm:right-10 w-64 bg-gray-900 border-t border-l border-r border-blue-500 rounded-t-lg shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-transform duration-300 z-40 ${isOpen ? 'translate-y-0' : 'translate-y-[calc(100%-40px)]'}`}>
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="w-full p-2 bg-blue-900/50 hover:bg-blue-800 text-blue-200 font-bold text-sm tracking-widest flex justify-between items-center"
      >
        <span>INVENTORY</span>
        <span>[{itemCount}] ▲</span>
      </button>
      <div className="p-4 h-48 overflow-y-auto bg-black/50">
        {itemCount === 0 ? (
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
      // ストップ処理：経過時間を引いて残り時間を更新
      const elapsed = Date.now() - gameState.timer.startTime;
      const newRemaining = Math.max(0, gameState.timer.remainingTime - elapsed);
      await updateDoc(docRef, { 'timer.isRunning': false, 'timer.remainingTime': newRemaining });
    } else {
      // スタート処理
      await updateDoc(docRef, { 'timer.isRunning': true, 'timer.startTime': Date.now() });
    }
  };

  const resetTimer = async () => {
    await updateDoc(docRef, { 'timer.isRunning': false, 'timer.remainingTime': 45 * 60 * 1000 });
  };

  // Step操作
  const setStep = async (step) => {
    if (confirm(`本当に STEP ${step} を解放しますか？`)) {
      await updateDoc(docRef, { currentStep: step });
    }
  };

  // 長押しリセット機能
  const handleResetMousedown = () => {
    let count = 0;
    resetTimerRef.current = setInterval(() => {
      count += 5; // 50msごとに5%進む (1000ms=1秒で完了に設定、お好みで調整)
      setResetProgress(count);
      if (count >= 100) {
        clearInterval(resetTimerRef.current);
        setDoc(docRef, initialGameState); // 完全に初期化
        setResetProgress(0);
      }
    }, 50);
  };

  const handleResetMouseup = () => {
    clearInterval(resetTimerRef.current);
    setResetProgress(0);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col gap-8">
      
      {/* 進行状況パネル */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
        <h3 className="text-xl font-bold text-gray-300 mb-4 border-b border-gray-700 pb-2">現在の進捗</h3>
        <div className="flex items-center justify-between mb-4">
          <div className="text-4xl text-blue-400 font-bold">{gameState.solvedPuzzles.length} <span className="text-lg text-gray-500">/ 50 解除済</span></div>
          <div className="text-xl text-yellow-500 font-bold">現在のフェーズ: STEP {gameState.currentStep === 4 ? 'LAST' : gameState.currentStep}</div>
        </div>
      </div>

      {/* タイマー制御パネル */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
        <h3 className="text-xl font-bold text-gray-300 mb-4 border-b border-gray-700 pb-2">タイマー制御</h3>
        <div className="flex gap-4">
          <button onClick={toggleTimer} className={`flex-1 py-4 font-bold rounded ${gameState.timer.isRunning ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-green-700 hover:bg-green-600'}`}>
            {gameState.timer.isRunning ? '⏸ 一時停止' : '▶ スタート'}
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
          {/* 長押しのプログレスバー背景 */}
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
    
    // 新しく追加されたログだけを抽出
    const newLogs = logs.filter(
      newLog => !previousLogsRef.current.some(prevLog => prevLog.id === newLog.id)
    );

    if (newLogs.length > 0) {
      setToasts(prev => [...prev, ...newLogs]);
      
      // 5秒後に消すタイマーをセット
      newLogs.forEach(log => {
        setTimeout(() => {
          setToasts(current => current.filter(t => t.id !== log.id));
        }, 5000);
      });
    }
    
    previousLogsRef.current = logs;
  }, [logs]);

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col-reverse gap-2 pointer-events-none">
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