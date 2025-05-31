// ==UserScript==
// @name         pixiv屏蔽关键词/作者/标签（三重过滤）
// @namespace    http://tampermonkey.net/
// @version      2025-05-05
// @description  屏蔽含有指定关键词、作者名或标签的 Pixiv 项目（小说/插画均可）
// @author       灌注雾莉静子喵
// @match        https://www.pixiv.net/tags*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pixiv.net
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

const contentKeywords = ["无限制","ai平台"]; // 作品文本关键字
const authorKeywords = ["勇敢小爱","fhg","gfh"]; // 作者名关键字
const tagKeywords = ["语c","男同"]; // 标签关键字
    const style = document.createElement('style');
    style.textContent = `
        #toggleAIButton {
            position: fixed;
            left: 10px;
            top: 50%;
            transform: translateY(-50%);
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
        #toggleAIButton:hover {
            background: #45a049;
        }
        .hidden-by-ai-toggle {
            display: none !important;
        }
    `;
    document.head.appendChild(style);

    const toggleButton = document.createElement('button');
    toggleButton.id = 'toggleAIButton';
    toggleButton.textContent = 'Hide AI';
    document.body.appendChild(toggleButton);

    let isHidden = false;
    let observedElements = [];

    function findTargetElements() {
        return document.querySelectorAll('#__next ul li');
    }

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

    function toggleElements() {
        observedElements.forEach(li => {
            // 作者名
            const authorElem = li.querySelector('div > div:nth-child(2) > div > div:nth-child(2) > a');
            const authorName = authorElem ? authorElem.textContent.trim() : '';

            // 文本内容
            const contentElem = li.querySelector('div > div:nth-child(2) > div > div:nth-child(3) > div > div > div');
            const contentText = contentElem ? contentElem.textContent.trim() : '';

            // 标签内容
            const tags = getTagTexts(li);
            const matchTags = tags.some(tag => containsKeyword(tag, tagKeywords));

            const matchAuthor = containsKeyword(authorName, authorKeywords);
            const matchContent = containsKeyword(contentText, contentKeywords);

            li.classList.toggle('hidden-by-ai-toggle', isHidden && (matchAuthor || matchContent || matchTags));
        });
    }

    function init() {
        observedElements = findTargetElements();
        toggleElements();
    }

    toggleButton.addEventListener('click', function () {
        isHidden = !isHidden;
        toggleButton.textContent = isHidden ? 'Show AI' : 'Hide AI';
        toggleElements();
    });

    const observer = new MutationObserver(() => {
        init();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    init();
})();
