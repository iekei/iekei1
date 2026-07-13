const GITHUB_USER = 'iekei';
const REPO_NAME = 'iekei1';

document.addEventListener('DOMContentLoaded', () => {
    // 1. 共通サイドバーの読み込み (chatと同様の仕組み)
    fetch('../sidebar.html')
        .then(res => res.text())
        .then(data => {
            document.getElementById('sidebar-container').innerHTML = data;
            initSidebar(); // 開閉ロジックの起動
        })
        .catch(err => console.error('Sidebar load error:', err));

    // 2. 画像のBase64埋め込み処理
    const imageInput = document.getElementById('blog-image');
    const contentArea = document.getElementById('blog-content');

    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                // 画像タグを本文に自動挿入
                contentArea.value += `\n<img src="${reader.result}" alt="uploaded image" />\n`;
            };
            reader.readAsDataURL(file);
        }
    });

    // 3. GitHubへの自動保存（アップロード）処理
    const publishBtn = document.getElementById('publish-btn');
    const statusMsg = document.getElementById('status-message');

    publishBtn.addEventListener('click', async () => {
        const token = document.getElementById('github-token').value;
        const title = document.getElementById('blog-title').value;
        const content = contentArea.value;

        if (!token || !title || !content) {
            statusMsg.innerText = '❌ トークン、タイトル、本文を入力してください。';
            statusMsg.style.color = '#ff4d4d';
            return;
        }

        statusMsg.innerText = '⏳ GitHubにアップロード中...';
        statusMsg.style.color = '#ffcc00';

        // 投稿用データの組み立て（今回はJSONデータとして個別保存）
        const postData = {
            title: title,
            date: new Date().toLocaleDateString(),
            content: content
        };

        const fileName = `post-${Date.now()}.json`; // 重複しないファイル名
        const url = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/blog/posts/${fileName}`;
        const utf8B64 = btoa(unescape(encodeURIComponent(JSON.stringify(postData, null, 2))));

        try {
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `📝 Add blog: ${title}`,
                    content: utf8B64,
                    branch: 'main'
                })
            });

            if (response.ok) {
                statusMsg.innerText = '🎉 公開成功！数分後に反映されます。';
                statusMsg.style.color = '#2ecc71';
                // フォームのクリア
                document.getElementById('blog-title').value = '';
                contentArea.value = '';
                loadPosts(); // リストの更新
            } else {
                throw new Error('Upload failed');
            }
        } catch (error) {
            statusMsg.innerText = '❌ エラーが発生しました。トークンの権限を確認してください。';
            statusMsg.style.color = '#ff4d4d';
        }
    });

    // 4. 過去のブログデータを読み込んで表示する機能
    async function loadPosts() {
        const container = document.getElementById('posts-container');
        const listUrl = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/blog/posts`;

        try {
            const res = await fetch(listUrl);
            if (!res.ok) {
                container.innerHTML = '<p>まだ投稿はありません。</p>';
                return;
            }
            const files = await res.json();
            container.innerHTML = ''; // クリア

            // ファイル名が新しい順（降順）にソートして読み込む
            const jsonFiles = files.filter(f => f.name.endsWith('.json')).reverse();

            for (let file of jsonFiles) {
                const fileRes = await fetch(file.download_url);
                const post = await fileRes.json();

                const postHtml = `
                    <article class="blog-post">
                        <h3>${post.title}</h3>
                        <small>📅 ${post.date}</small>
                        <div class="post-body">${post.content}</div>
                    </article>
                `;
                container.innerHTML += postHtml;
            }
        } catch (err) {
            container.innerHTML = '<p>記事の取得に失敗しました、またはまだフォルダがありません。</p>';
        }
    }

    // 初回読み込み
    loadPosts();

    // 共通サイドバーの開閉ロジック
    function initSidebar() {
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
});
