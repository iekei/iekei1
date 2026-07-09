// 1. 同一フォルダ内の sidebar.html を読み込む
fetch('sidebar.html')
    .then(response => {
        if (!response.ok) throw new Error('サイドバーの読み込みに失敗しました');
        return response.text();
    })
    .then(data => {
        document.getElementById('sidebar-container').innerHTML = data;
        
        // サイドバー配置後に各イベントを初期化
        initSidebarEvents();
        initTheme();
    })
    .catch(error => console.error(error));

// 2. サイドバーの開閉イベントを設定
function initSidebarEvents() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const toggleBtn = document.getElementById('toggle-btn');
    
    if (toggleBtn && sidebar && mainContent) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('closed');
            mainContent.classList.toggle('expanded');
        });
    }
}

// 3. テーマ切り替えイベントを設定
function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const currentTheme = localStorage.getItem('theme') || 'dark'; // デフォルトはダーク

    if (currentTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        if (themeToggle) themeToggle.checked = true;
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    if (themeToggle) {
        themeToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
            }
        });
    }
}

// 4. マウスの動きに連動する3Dカード傾きエフェクト
const card = document.getElementById('profile-card');
if (card) {
    document.addEventListener('mousemove', (e) => {
        // ライトモード時は3D効果をマイルドに、または好みに応じて調整
        const xAxis = (window.innerWidth / 2 - e.pageX) / 25;  // 傾きの強さ調整
        const yAxis = (window.innerHeight / 2 - e.pageY) / 25;
        card.style.transform = `rotateY(${xAxis}deg) rotateX(${-yAxis}deg)`;
    });

    // マウスが画面から外れたら元の角度に戻すリセット
    document.addEventListener('mouseleave', () => {
        card.style.transform = 'rotateY(0deg) rotateX(0deg)';
        card.style.transition = 'all 0.5s ease';
    });

    document.addEventListener('mouseenter', () => {
        card.style.transition = 'none';
    });
}
