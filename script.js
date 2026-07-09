// サイドバーを外部ファイルから読み込む
// ※ aboutフォルダからでもルートからでも動くように絶対パス「/sidebar.html」にするか、手動で調整します
fetch('/sidebar.html') 
    .then(response => response.text())
    .then(data => {
        document.getElementById('sidebar-container').innerHTML = data;
        
        // サイドバーが読み込まれた「後」に、開閉ボタンなどのイベントを設定する
        setupSidebarEvents(); 
    });

function setupSidebarEvents() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const toggleBtn = document.getElementById('toggle-btn');
    
    if(toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('closed');
            mainContent.classList.toggle('expanded');
        });
    }
}
const sidebar = document.getElementById('sidebar');
const mainContent = document.getElementById('main-content');
const toggleBtn = document.getElementById('toggle-btn');
const themeToggle = document.getElementById('theme-toggle');

// サイドバーの開閉イベント
toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('closed');
    mainContent.classList.toggle('expanded');
});

// テーマの切り替えイベント
themeToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
});
