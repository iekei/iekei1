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
