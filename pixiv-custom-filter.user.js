// ==UserScript==
// @name         Pixiv小说自定义屏蔽26.4.26
// @namespace    http://tampermonkey.net/
// @version      2026.4.26
// @description  修复短简介被误判为无简介 + 内容关键词强化检查系列/标题/简介
// @author       echo
// @match        https://www.pixiv.net/search*
// @match        https://www.pixiv.net/tag*

// @grant        GM_addStyle
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/echo152/pixiv-custom-filter/main/pixiv-custom-filter.user.js
// @updateURL    https://raw.githubusercontent.com/echo152/pixiv-custom-filter/main/pixiv-custom-filter.user.js
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    /* ================= 配置 ================= */
    const defaultConfig = {
        contentKeywords: ['无限制ai', 'ai风月', 'ai网站'],
        authorKeywords: ['（', '('],
        tagKeywords: ['语c', '男同', 'BL'],
        minTextLength: 0,
        maxTextLength: 100000,
        hideNoDescription: true
    };

    function getConfig() {
        try {
            return { ...defaultConfig, ...JSON.parse(localStorage.getItem('pixivFilterConfig') || '{}') };
        } catch {
            return { ...defaultConfig };
        }
    }

    function saveConfig(config) {
        localStorage.setItem('pixivFilterConfig', JSON.stringify(config));
    }

    let config = getConfig();
    let isHidden = false;
    let elements = [];

    /* ================= UI样式 ================= */
    GM_addStyle(`
        #pixivFilterBtn, #pixivConfigBtn {
            all: unset; position: fixed !important; left: 16px !important; z-index: 2147483647 !important;
            display: flex !important; align-items: center; justify-content: center;
            padding: 8px 12px; border-radius: 8px; font-size: 13px; font-weight: 600;
            cursor: pointer; user-select: none; color: #fff;
            background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        }
        #pixivFilterBtn { top: 45% !important; }
        #pixivConfigBtn { top: 52% !important; background: rgba(30,144,255,0.75); }
        #pixivFilterBtn:hover, #pixivConfigBtn:hover { opacity: 0.9; }
        .hidden-by-ai-toggle { display: none !important; }

        #pixivConfigPanel {
            position: fixed; top: 120px; left: 120px; width: 420px; background: #fff;
            padding: 16px; border-radius: 10px; z-index: 2147483647; display: none;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        #pixivConfigPanel textarea { width: 100%; height: 60px; margin-top: 4px; }
    `);

    const panel = document.createElement('div');
    panel.id = 'pixivConfigPanel';
    panel.innerHTML = `
<div style="display:flex;flex-direction:column;gap:10px;font-size:13px">
    <div>内容关键词（系列+标题+简介） <textarea id="c">${config.contentKeywords.join('\n')}</textarea></div>
    <div>作者关键词 <textarea id="a">${config.authorKeywords.join('\n')}</textarea></div>
    <div>标签关键词 <textarea id="t">${config.tagKeywords.join('\n')}</textarea></div>
    <div>最小字数 <input type="number" id="min" style="width:100%" value="${config.minTextLength}"></div>
    <div>最大字数 <input type="number" id="max" style="width:100%" value="${config.maxTextLength}"></div>
    <label style="display:flex;gap:6px;align-items:center">
        <input type="checkbox" id="no" ${config.hideNoDescription ? 'checked' : ''}> 隐藏无简介小说
    </label>
    <div style="display:flex;justify-content:flex-end;gap:8px">
        <button id="save">保存</button>
        <button id="close">关闭</button>
    </div>
</div>`;

    const btn = document.createElement('button'); btn.id = 'pixivFilterBtn'; btn.textContent = 'Hide';
    const cfgBtn = document.createElement('button'); cfgBtn.id = 'pixivConfigBtn'; cfgBtn.textContent = '设置';

    function mountUI() {
        if (!document.body || document.getElementById('pixivFilterBtn')) return;
        document.body.appendChild(btn);
        document.body.appendChild(cfgBtn);
        document.body.appendChild(panel);
    }

    /* ================= 工具 ================= */
    const contains = (text, keys) => {
        if (!text) return [];
        text = text.toLowerCase();
        return keys.filter(k => k && text.includes(k.toLowerCase()));
    };

    function findItems() {
        return document.querySelectorAll('[data-ga4-label="thumbnail"]');
    }

    /* ================= 作者提取 - v18 严格版 ================= */
    function getAuthor(li) {
        const titleEl = li.querySelector('.gtm-novel-searchpage-result-title');
        const seriesEl = li.querySelector('.gtm-novel-searchpage-result-series-title');
        const title = titleEl ? titleEl.textContent.trim() : '';
        const series = seriesEl ? seriesEl.textContent.trim() : '';

        // 1. 最稳定：GTM 作者类
        let authorEl = li.querySelector('.gtm-novel-searchpage-result-user');
        if (authorEl) {
            let name = (authorEl.textContent || '').trim();
            if (name && name !== title && name !== series && name.length < 30) {
                return name;
            }
        }

        // 2. href="/users/" 的链接（作者链接）
        authorEl = li.querySelector('a[href^="/users/"]');
        if (authorEl) {
            let name = (authorEl.textContent || '').trim();
            if (name && name !== title && name !== series && name.length < 30) {
                return name;
            }
        }

        // 3. 兜底：查找第二个用户相关的链接（避免取到标题）
        const userLinks = li.querySelectorAll('a[href^="/users/"], a.gtm-novel-searchpage-result-user');
        for (let link of userLinks) {
            let name = (link.textContent || '').trim();
            if (name && name.length > 1 && name.length < 25 && name !== title && name !== series) {
                return name;
            }
        }

        console.log(`[Author Debug] 未提取到有效作者 (标题: ${title})`);
        return '';
    }

    /* ================= 简介判断 ================= */
    function hasValidDesc(li) {
        const titleEl = li.querySelector('.gtm-novel-searchpage-result-title');
        const seriesEl = li.querySelector('.gtm-novel-searchpage-result-series-title');
        const title = titleEl ? titleEl.textContent.trim() : '';
        const seriesTitle = seriesEl ? seriesEl.textContent.trim() : '';

        const textBlocks = li.querySelectorAll('.charcoal-text-ellipsis, [data-line-limit]');

        for (let block of textBlocks) {
            let text = (block.textContent || '').trim();
            if (!text || text === title || text === seriesTitle || text.startsWith(title)) continue;
            if (text.length >= 8) return true;
        }

        // 空容器检测
        for (let container of li.querySelectorAll('div')) {
            if ((container.textContent || '').trim() === '') {
                const next = container.nextElementSibling;
                if (next && next.querySelector('.sc-66169772-0')) return false;
            }
        }
        return false;
    }

    function getTextLength(li) {
        for (let s of li.querySelectorAll('.sc-66169772-0')) {
            if (s.textContent.includes('字')) {
                return parseInt(s.textContent.replace(/\D/g, '')) || 0;
            }
        }
        return 0;
    }

    /* ================= 核心逻辑 ================= */
    function run() {
        elements.forEach(li => {
            const titleEl = li.querySelector('.gtm-novel-searchpage-result-title');
            const seriesEl = li.querySelector('.gtm-novel-searchpage-result-series-title');

            const title = titleEl ? titleEl.textContent.trim() : '';
            const series = seriesEl ? seriesEl.textContent.trim() : '';
            const author = getAuthor(li);

            const tags = Array.from(li.querySelectorAll('a[href*="tags/"], a.gtm-novel-searchpage-result-tag'))
                .map(a => (a.textContent || '').trim());

            const textLength = getTextLength(li);

            const desc = (() => {
                for (let b of li.querySelectorAll('.charcoal-text-ellipsis, [data-line-limit]')) {
                    let t = (b.textContent || '').trim();
                    if (t.length > 8 && t !== title && t !== series) {
                        return t.replace(/[\s\n\r\u3000]+/g, ' ').trim();
                    }
                }
                return '';
            })();

            let reasons = [];

            if (contains(series, config.contentKeywords).length) reasons.push(`系列关键词`);
            if (contains(title, config.contentKeywords).length) reasons.push(`标题关键词`);
            if (contains(desc, config.contentKeywords).length) reasons.push(`简介关键词`);
            if (reasons.length === 0 && contains(li.textContent || '', config.contentKeywords).length) reasons.push('全文含关键词');

            if (author && contains(author, config.authorKeywords).length) {
                reasons.push(`作者关键词: ${author}`);
            }

            if (contains(tags.join(' '), config.tagKeywords).length) reasons.push(`标签关键词`);
            if (textLength < config.minTextLength) reasons.push(`字数过少(${textLength})`);
            if (textLength > config.maxTextLength) reasons.push(`字数过多(${textLength})`);
            if (config.hideNoDescription && !hasValidDesc(li)) reasons.push('无简介');

            const shouldHide = isHidden && reasons.length > 0;

            li.classList.toggle('hidden-by-ai-toggle', shouldHide);

            if (shouldHide) {
                console.log(`🛑 已屏蔽 | 标题: ${title} | 作者: ${author || '未知'} | 原因: ${reasons.join(' | ')}`);
            }
        });
    }

    function init() {
        elements = Array.from(findItems());
        run();
    }

    /* ================= 事件 ================= */
    btn.onclick = () => { isHidden = !isHidden; btn.textContent = isHidden ? 'Show' : 'Hide'; run(); };
    cfgBtn.onclick = () => { panel.style.display = panel.style.display === 'block' ? 'none' : 'block'; };

    panel.querySelector('#save').onclick = () => {
        config = {
            contentKeywords: panel.querySelector('#c').value.split('\n').filter(Boolean),
            authorKeywords: panel.querySelector('#a').value.split('\n').filter(Boolean),
            tagKeywords: panel.querySelector('#t').value.split('\n').filter(Boolean),
            minTextLength: +panel.querySelector('#min').value || 0,
            maxTextLength: +panel.querySelector('#max').value || 999999,
            hideNoDescription: panel.querySelector('#no').checked
        };
        saveConfig(config);
        init();
        alert('配置已保存');
    };

    panel.querySelector('#close').onclick = () => { panel.style.display = 'none'; };

    setInterval(mountUI, 2000);
    new MutationObserver(() => setTimeout(init, 600)).observe(document.body, { childList: true, subtree: true });

    mountUI();
    setTimeout(init, 1000);

    console.log('✅ Pixiv小说屏蔽脚本 v18 已启动（作者提取已严格区分标题/系列）');
})();
