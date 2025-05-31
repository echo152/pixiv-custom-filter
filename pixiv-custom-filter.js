// ==UserScript==
// @name         Pixiv屏蔽关键词/作者/标签（三重过滤）+设置面板+导入导出
// @namespace    http://tampermonkey.net/
// @version      2025-05-31
// @description  屏蔽含有指定关键词、作者名或标签的 Pixiv 项目，支持自定义关键词和导入导出设置。
// @author       灌注雾莉静子喵
// @match        https://www.pixiv.net/tags*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pixiv.net
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    const defaultConfig = {
        contentKeywords: ['无限制ai', 'ai风月'],
        authorKeywords: ['（', '('],
        tagKeywords: ['语c', '男同']
    };

    function getConfig() {
        const saved = localStorage.getItem('pixivFilterConfig');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.warn('配置解析失败，使用默认值');
            }
        }
        return { ...defaultConfig };
    }

    function saveConfig(config) {
        localStorage.setItem('pixivFilterConfig', JSON.stringify(config));
    }

    let config = getConfig();

    GM_addStyle(`
        #pixivFilterBtn, #pixivConfigBtn {
            position: fixed;
            left: 10px;
            z-index: 9999;
            padding: 8px 12px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        #pixivFilterBtn { top: 50%; }
        #pixivConfigBtn { top: 60%; background: #2196F3; }

        .hidden-by-ai-toggle { display: none !important; }

        #pixivConfigPanel {
            position: fixed;
            top: 120px;
            left: 120px;
            width: 400px;
            background: #fff;
            color: #333;
            padding: 16px;
            border-radius: 10px;
            box-shadow: 0 0 15px rgba(0,0,0,0.3);
            z-index: 10000;
            display: none;
            font-size: 14px;
        }

        #pixivConfigPanel textarea {
            width: 100%;
            height: 60px;
            margin-bottom: 20px;
        }

        #pixivConfigPanel button {
            margin-right: 8px;
        }
    `);

    // 插入设置面板
    const configPanel = document.createElement('div');
    configPanel.id = 'pixivConfigPanel';
    configPanel.innerHTML = `
        <div><strong>内容关键词：</strong></div>
        <textarea id="contentInput">${config.contentKeywords.join('\n')}</textarea>
        <div><strong>作者关键词：</strong></div>
        <textarea id="authorInput">${config.authorKeywords.join('\n')}</textarea>
        <div><strong>标签关键词：</strong></div>
        <textarea id="tagInput">${config.tagKeywords.join('\n')}</textarea>
        <button id="saveBtn">保存</button>
        <button id="exportBtn">导出</button>
        <button id="importBtn">导入</button>
        <button id="closeBtn">关闭</button>
    `;
    document.body.appendChild(configPanel);

    // 插入按钮
    const toggleButton = document.createElement('button');
    toggleButton.id = 'pixivFilterBtn';
    toggleButton.textContent = 'Hide AI';
    document.body.appendChild(toggleButton);

    const configButton = document.createElement('button');
    configButton.id = 'pixivConfigBtn';
    configButton.textContent = '关键词设置';
    document.body.appendChild(configButton);

    let isHidden = false;
    let configPanelVisible = false;
    let observedElements = [];

    function containsKeyword(text, keywords) {
        const lower = text.toLowerCase();
        return keywords.some(k => lower.includes(k.toLowerCase()));
    }

    function getTagTexts(li) {
        const tags = [];
        const tagLinks = li.querySelectorAll('div > div:nth-child(2) > div > div:nth-child(3) ul a, ul span span');
        tagLinks.forEach(tag => {
            const text = tag.textContent?.trim();
            if (text) tags.push(text);
        });
        return tags;
    }

    function findTargetElements() {
        return document.querySelectorAll('#__next ul li');
    }

    function toggleElements() {
        observedElements.forEach(li => {
            const authorElem = li.querySelector('div > div:nth-child(2) > div > div:nth-child(2) > a');
            const authorName = authorElem ? authorElem.textContent.trim() : '';

            const contentElem = li.querySelector('div > div:nth-child(2) > div > div:nth-child(3) > div > div > div');
            const contentText = contentElem ? contentElem.textContent.trim() : '';

            const tags = getTagTexts(li);

            const matchTags = tags.some(tag => containsKeyword(tag, config.tagKeywords));
            const matchAuthor = containsKeyword(authorName, config.authorKeywords);
            const matchContent = containsKeyword(contentText, config.contentKeywords);

            li.classList.toggle('hidden-by-ai-toggle', isHidden && (matchAuthor || matchContent || matchTags));
        });
    }

    function init() {
        observedElements = Array.from(findTargetElements());
        toggleElements();
    }

    toggleButton.addEventListener('click', function () {
        isHidden = !isHidden;
        toggleButton.textContent = isHidden ? 'Show AI' : 'Hide AI';
        toggleElements();
    });

    configButton.addEventListener('click', function () {
        configPanelVisible = !configPanelVisible;
        configPanel.style.display = configPanelVisible ? 'block' : 'none';
    });

    configPanel.querySelector('#saveBtn').addEventListener('click', () => {
        config.contentKeywords = configPanel.querySelector('#contentInput').value.split('\n').map(s => s.trim()).filter(Boolean);
        config.authorKeywords = configPanel.querySelector('#authorInput').value.split('\n').map(s => s.trim()).filter(Boolean);
        config.tagKeywords = configPanel.querySelector('#tagInput').value.split('\n').map(s => s.trim()).filter(Boolean);
        saveConfig(config);
        init();
        alert('已保存设置');
    });

    configPanel.querySelector('#exportBtn').addEventListener('click', () => {
        const exportData = JSON.stringify(config, null, 2);
        navigator.clipboard.writeText(exportData).then(() => alert('配置已复制到剪贴板'));
    });

    configPanel.querySelector('#importBtn').addEventListener('click', () => {
        const input = prompt('请粘贴你导出的配置JSON：');
        if (input) {
            try {
                const imported = JSON.parse(input);
                config = imported;
                saveConfig(config);
                location.reload();
            } catch (e) {
                alert('导入失败，JSON 格式有误。');
            }
        }
    });

    configPanel.querySelector('#closeBtn').addEventListener('click', () => {
        configPanel.style.display = 'none';
        configPanelVisible = false;
    });

    const observer = new MutationObserver(() => {
        init();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    init();
})();
