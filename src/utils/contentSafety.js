/**
 * 判断文本是否包含敏感词
 * @param {string} text 待检测文本
 * @param {string[]} badWords 敏感词库
 * @returns {boolean} 是否命中敏感词
 */
export function hasBadWords(text, badWords) {
    if (!text) return false;
    const source = String(text);
    return (badWords || []).some((w) => source.includes(w));
}

/**
 * 校验单个文件是否满足白名单与大小限制
 * @param {File|Blob} file 待校验文件
 * @param {string[]} whitelist 允许的 MIME 类型
 * @param {number} maxBytes 最大字节数
 * @returns {string} 错误消息；空串表示通过
 */
export function validateUpload(file, whitelist, maxBytes) {
    if (!file) return '';
    if (typeof maxBytes === 'number' && file.size > maxBytes) return `文件过大：${file.name}`;
    if (Array.isArray(whitelist) && whitelist.length > 0 && !whitelist.includes(file.type)) return `不支持的类型：${file.name}`;
    return '';
}

/**
 * 校验一组文件
 * @param {FileList|Array<File>} files 文件列表
 * @param {string[]} whitelist 允许的 MIME 类型
 * @param {number} maxBytes 最大字节数
 * @returns {string} 错误消息；空串表示通过
 */
export function validateFiles(files, whitelist, maxBytes) {
    const list = Array.from(files || []);
    for (const f of list) {
        const err = validateUpload(f, whitelist, maxBytes);
        if (err) return err;
    }
    return '';
}
