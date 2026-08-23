// LocalStorageから保存された日付とスピードを復元（なければ初期値）
let gameDate = localStorage.getItem('gameDate') ? new Date(localStorage.getItem('gameDate')) : new Date(1936, 0, 1);
let gameSpeed = localStorage.getItem('gameSpeed') ? parseInt(localStorage.getItem('gameSpeed'), 10) : 0;

document.addEventListener('DOMContentLoaded', () => {
    // サイドバーを外部ファイルから読み込む
    fetch('/sidebar.html') 
        .then(response => response.text())
        .then(data => {
            const container = document.getElementById('sidebar-container');
            if (container) {
                container.innerHTML = data;
            }
            // サイドバーが読み込まれた「後」にイベントを設定
            setupSidebarEvents(); 
        });

    // カレンダーと速度変更ボタンの初期化・連動
    initClock();

    // ★他画面（研究や生産など）からのストレージ変更をリアルタイム検知
    window.addEventListener('storage', (e) => {
        if (e.key === 'gameSpeed') {
            gameSpeed = parseInt(e.newValue || '0', 10);
            updateSpeedButtonUI();
        }
        if (e.key === 'gameDate') {
            gameDate = new Date(e.newValue);
            updateCalendarUI();
        }
    });

    // 定期ポーリングによる確実な同期
    setInterval(() => {
        const savedDateStr = localStorage.getItem('gameDate');
        if (savedDateStr) {
            const latestDate = new Date(savedDateStr);
            if (latestDate.getTime() !== gameDate.getTime()) {
                gameDate = latestDate;
                updateCalendarUI();
            }
        }
    }, 1000);
});

function setupSidebarEvents() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const toggleBtn = document.getElementById('toggle-btn');
    const themeToggle = document.getElementById('theme-toggle');
    
    if(toggleBtn && sidebar && mainContent) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('closed');
            mainContent.classList.toggle('expanded');
        });
    }

    if(themeToggle) {
        // テーマの切り替えイベント
        themeToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-theme');
            }
        });
    }
}

// --- 共通クロック・速度連動システム ---
function initClock() {
    updateSpeedButtonUI();
    updateCalendarUI();

    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const speedAttr = e.target.getAttribute('data-speed');
            gameSpeed = speedAttr !== null ? parseInt(speedAttr, 10) : 0;
            
            // LocalStorageに保存して全画面と同期
            localStorage.setItem('gameSpeed', gameSpeed);
            updateSpeedButtonUI();
            runTick();
        });
    });

    const speedIntervals = { 1: 2000, 2: 1200, 3: 700, 4: 350, 5: 120 };
    let gameTimer = null;

    function runTick() {
        if (gameTimer) clearInterval(gameTimer);
        gameSpeed = parseInt(localStorage.getItem('gameSpeed') || '0', 10);

        if (gameSpeed > 0) {
            gameTimer = setInterval(() => {
                // 他画面で進んだ日付をローカルストレージから取得して同期
                const savedDateStr = localStorage.getItem('gameDate');
                if (savedDateStr) {
                    gameDate = new Date(savedDateStr);
                }

                // 1日進める
                gameDate.setDate(gameDate.getDate() + 1);
                localStorage.setItem('gameDate', gameDate.toISOString());
                updateCalendarUI();
            }, speedIntervals[gameSpeed] || 1000);
        }
    }

    if (gameSpeed > 0) {
        runTick();
    }
}

function updateCalendarUI() {
    const calEl = document.getElementById('calendar-display');
    if (calEl) {
        calEl.textContent = `${gameDate.getFullYear()}年${gameDate.getMonth() + 1}月${gameDate.getDate()}日`;
    }
}

function updateSpeedButtonUI() {
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    if (gameSpeed === 0) {
        const pauseBtn = document.getElementById('btn-pause');
        if (pauseBtn) pauseBtn.classList.add('active');
    } else {
        const targetBtn = document.querySelector(`.speed-btn[data-speed="${gameSpeed}"]`);
        if (targetBtn) targetBtn.classList.add('active');
    }
}
