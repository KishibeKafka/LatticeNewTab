/**
 * i18n.js — tiny dictionary + DOM applier.
 * Language preference: 'auto' (browser) | 'en' | 'zh'.
 */
(() => {
  'use strict';

  const DICT = {
    en: {
      'app.title': 'New Tab',
      'hud.photos': '{n} photos · {label}',
      'source.library': 'your library',
      'credit.library': 'Photos from your library',
      'credit.classic': 'Classic set · bundled offline',
      'credit.curated': 'Curated from picsum.photos',

      'action.customize': 'Customize',
      'action.openSettings': 'Customize your new tab',
      'action.close': 'Close',
      'action.add': 'Add',
      'action.clearLibrary': 'Remove all photos',
      'action.shuffle': 'Shuffle',
      'action.removePhoto': 'Remove {name}',
      'shortcuts.label': 'Shortcuts',

      'shortcut.upload': 'Upload',
      'shortcut.url': 'Add URL',
      'shortcut.explore': 'Explore',
      'shortcut.shuffle': 'Shuffle',

      'drawer.eyebrow': 'Appearance',
      'drawer.title': 'Customize',
      'group.background': 'Background',
      'group.wall': 'Wall',
      'group.atmosphere': 'Atmosphere',
      'group.clock': 'Clock & search',

      'tab.upload': 'Upload',
      'tab.url': 'URLs',
      'tab.explore': 'Explore',

      'drop.title': 'Drop photos to add them',
      'drop.sub': 'JPG, PNG, WebP or AVIF · stored on this device',
      'url.placeholder': 'https://example.com/photo.jpg',
      'url.note': 'Public image links work too — they are fetched by your browser, not by us.',
      'explore.note':
        'Classic is bundled and works offline. The other sets stream from the web; your own uploads never leave this device.',

      'control.density': 'Density',
      'control.tilt': 'Tilt',
      'control.gap': 'Gap & padding',
      'control.radius': 'Corner radius',
      'control.shape': 'Tile shape',
      'control.wash': 'Wash',
      'control.blur': 'Blur',
      'control.grain': 'Film grain',
      'control.grainDesc': 'Subtle analog texture',
      'control.clock24': '24-hour time',
      'control.clock24Desc': 'Drop the AM / PM suffix',
      'control.seconds': 'Seconds',
      'control.secondsDesc': 'Show a live seconds counter',
      'control.greeting': 'Greeting',
      'control.greetingDesc': 'A soft hello above the clock',
      'control.engine': 'Search engine',
      'control.language': 'Language',

      'radius.sharp': 'Sharp',
      'radius.soft': 'Soft',
      'radius.round': 'Round',
      'shape.mixed': 'Mixed',
      'shape.square': 'Square',
      'shape.portrait': 'Portrait',
      'lang.auto': 'Auto',
      'lang.en': 'English',
      'lang.zh': '中文',

      'btn.reset': 'Reset appearance',
      'btn.done': 'Done',

      'unit.photos': '{n} photos',
      'unit.tiles': '{n} tiles',
      'unit.px': '{n} px',
      'unit.deg': '{n}°',
      'unit.percent': '{n}%',

      'search.placeholder': 'Search {engine} or type a URL',
      'search.engineAria': 'Search engine',
      'search.inputAria': 'Search',
      'drawer.aria': 'Customize panel',

      'greet.late': 'Still up',
      'greet.morning': 'Good morning',
      'greet.afternoon': 'Good afternoon',
      'greet.evening': 'Good evening',
      'greet.night': 'Good night',

      'set.classic.label': 'Classic',
      'set.editorial.label': 'Editorial',
      'set.noir.label': 'Noir',
      'set.soft.label': 'Soft focus',
      'set.wide.label': 'Wide',

      'toast.adding': 'Adding {n} photos…',
      'toast.added': 'Added {n} photos',
      'toast.addedSkipped': 'Added {n} photos · {failed} skipped',
      'toast.noImages': 'No images in that selection',
      'toast.couldNotRead': 'Could not read those images',
      'toast.importFailed': 'Could not add those photos',
      'toast.urlAdded': 'Image added to your wall',
      'toast.libraryCleared': 'Library cleared',
      'toast.shuffled': 'Wall shuffled',
      'toast.layoutReset': 'Appearance reset',
      'toast.collection': '{name} wall',
      'toast.removed': '{name} removed',
      'toast.confirmClear': 'Remove every photo from your library?',
      'toast.bootFailed': 'Something went wrong loading your wall',

      'error.bad-url': 'That does not look like a link',
      'error.protocol': 'Only http(s) image links are supported',
      'error.duplicate': 'That image is already on your wall',
      'error.load-failed': 'Could not load that image',
      'error.timeout': 'That image took too long to load',
      'error.no-images': 'No images found',

      'lightbox.close': 'Close photo',
      'focus.close': 'Return to the wall',
      'lightbox.prev': 'Previous photo',
      'lightbox.next': 'Next photo',
      'lightbox.counter': '{i} of {total}',
      'lightbox.open': 'Open photo',
      'collage.label': 'Endless photo wall',
      'wall.note': 'Drag to pan the seamless wall · click a photo to expand it at full size; the rest of its block re-gears around it.',
    },

    zh: {
      'app.title': '新标签页',
      'hud.photos': '{n} 张照片 · {label}',
      'source.library': '你的图库',
      'credit.library': '来自你的图库',
      'credit.classic': '经典图集 · 内置离线',
      'credit.curated': '来自 picsum.photos',

      'action.customize': '自定义',
      'action.openSettings': '自定义新标签页',
      'action.close': '关闭',
      'action.add': '添加',
      'action.clearLibrary': '移除全部照片',
      'action.shuffle': '换一批',
      'action.removePhoto': '移除 {name}',
      'shortcuts.label': '快捷方式',

      'shortcut.upload': '上传',
      'shortcut.url': '加链接',
      'shortcut.explore': '探索',
      'shortcut.shuffle': '换一批',

      'drawer.eyebrow': '外观',
      'drawer.title': '自定义',
      'group.background': '背景',
      'group.wall': '拼贴',
      'group.atmosphere': '氛围',
      'group.clock': '时钟与搜索',

      'tab.upload': '上传',
      'tab.url': '链接',
      'tab.explore': '探索',

      'drop.title': '把照片拖到这里',
      'drop.sub': '支持 JPG、PNG、WebP、AVIF · 仅保存在本机',
      'url.placeholder': 'https://example.com/photo.jpg',
      'url.note': '也可以粘贴公开图片链接——由浏览器直接加载，不经过任何服务器。',
      'explore.note': '经典图集已内置，可离线使用；其他图集来自网络，你的上传永远留在本机。',

      'control.density': '密度',
      'control.tilt': '倾斜',
      'control.gap': '间距',
      'control.radius': '圆角',
      'control.shape': '图片形状',
      'control.wash': '蒙层',
      'control.blur': '模糊',
      'control.grain': '胶片颗粒',
      'control.grainDesc': '淡淡的胶片质感',
      'control.clock24': '24 小时制',
      'control.clock24Desc': '不显示 AM / PM',
      'control.seconds': '秒钟',
      'control.secondsDesc': '显示实时的秒钟',
      'control.greeting': '问候语',
      'control.greetingDesc': '在时钟上方轻声问候',
      'control.engine': '搜索引擎',
      'control.language': '语言',

      'radius.sharp': '直角',
      'radius.soft': '微圆',
      'radius.round': '圆润',
      'shape.mixed': '混合',
      'shape.square': '方形',
      'shape.portrait': '竖幅',
      'lang.auto': '跟随系统',
      'lang.en': 'English',
      'lang.zh': '中文',

      'btn.reset': '重置外观',
      'btn.done': '完成',

      'unit.photos': '{n} 张照片',
      'unit.tiles': '{n} 张',
      'unit.px': '{n} 像素',
      'unit.deg': '{n}°',
      'unit.percent': '{n}%',

      'search.placeholder': '在 {engine} 中搜索，或输入网址',
      'search.engineAria': '搜索引擎',
      'search.inputAria': '搜索',
      'drawer.aria': '自定义面板',

      'greet.late': '夜深了',
      'greet.morning': '早上好',
      'greet.afternoon': '下午好',
      'greet.evening': '晚上好',
      'greet.night': '晚安',

      'set.classic.label': '经典',
      'set.editorial.label': '编辑精选',
      'set.noir.label': '黑白',
      'set.soft.label': '柔焦',
      'set.wide.label': '宽幅',

      'toast.adding': '正在添加 {n} 张照片…',
      'toast.added': '已添加 {n} 张照片',
      'toast.addedSkipped': '已添加 {n} 张，{failed} 张跳过',
      'toast.noImages': '没有可用的图片',
      'toast.couldNotRead': '无法读取这些图片',
      'toast.importFailed': '添加照片时出错了',
      'toast.urlAdded': '已加入照片墙',
      'toast.libraryCleared': '图库已清空',
      'toast.shuffled': '已换一批',
      'toast.layoutReset': '外观已重置',
      'toast.collection': '{name}图集',
      'toast.removed': '已移除 {name}',
      'toast.confirmClear': '确定要移除图库中的所有照片吗？',
      'toast.bootFailed': '加载照片墙时出错了',

      'error.bad-url': '这个链接看起来不太对',
      'error.protocol': '只支持 http(s) 图片链接',
      'error.duplicate': '这张图片已经在墙上了',
      'error.load-failed': '无法加载这张图片',
      'error.timeout': '图片加载超时',
      'error.no-images': '没有找到图片',

      'lightbox.close': '关闭照片',
      'focus.close': '缩回拼贴',
      'lightbox.prev': '上一张',
      'lightbox.next': '下一张',
      'lightbox.counter': '第 {i} / {total} 张',
      'lightbox.open': '查看照片',
      'collage.label': '无限照片墙',
      'wall.note': '拖动浏览无缝拼贴 · 点击照片按原比例完整展开，同块其他卡片自动让位。',
    },
  };

  let lang = 'en';

  const resolve = (pref) => {
    if (pref === 'zh') return 'zh';
    if (pref === 'en') return 'en';
    const nav = (typeof navigator !== 'undefined' && navigator.language) || 'en';
    return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  };

  const t = (key, vars) => {
    const table = DICT[lang] || DICT.en;
    let value = table[key];
    if (value === undefined) value = DICT.en[key];
    if (value === undefined) return key;
    if (!vars) return value;
    return value.replace(/\{(\w+)\}/g, (match, name) =>
      name in vars ? String(vars[name]) : match
    );
  };

  const apply = (pref) => {
    lang = resolve(pref);
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = t('app.title');

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });

    window.dispatchEvent(new CustomEvent('lattice:language', { detail: { lang } }));
  };

  window.LatticeI18n = {
    t,
    apply,
    lang: () => lang,
    locale: () => (lang === 'zh' ? 'zh-CN' : 'en'),
  };
})();
