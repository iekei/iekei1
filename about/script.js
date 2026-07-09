const toggleSwitch = document.querySelector('#checkbox');
const currentTheme = localStorage.getItem('theme');

// 最初からダークモード（デフォルト）として扱う設定
if (currentTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    toggleSwitch.checked = true;
} else {
    document.documentElement.setAttribute('data-theme', 'dark');
}

function switchTheme(e) {
    if (e.target.checked) {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    }
}

toggleSwitch.addEventListener('change', switchTheme, false);
