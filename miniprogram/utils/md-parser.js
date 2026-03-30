/**
 * Markdown → HTML 解析器（精简版，适配小程序 rich-text）
 * 支持：加粗、表格、列表、标题、删除线、emoji
 */

/**
 * 将 Markdown 文本转为 HTML（供 rich-text 渲染）
 * @param {string} md - Markdown 文本
 * @returns {string} HTML 字符串
 */
function parseMarkdown(md) {
  if (!md) return '';

  let html = md;

  // 1. 表格
  html = parseTable(html);

  // 2. 标题（只处理 h3/h4 级别，避免太大）
  html = html.replace(/^###\s+(.+)$/gm, '<div style="font-size:30rpx;font-weight:700;margin:16rpx 0 8rpx;">$1</div>');
  html = html.replace(/^##\s+(.+)$/gm, '<div style="font-size:32rpx;font-weight:700;margin:20rpx 0 10rpx;">$1</div>');

  // 3. 加粗
  html = html.replace(/\*\*(.+?)\*\*/g, '<span style="font-weight:700;">$1</span>');

  // 4. 删除线
  html = html.replace(/~~(.+?)~~/g, '<span style="text-decoration:line-through;color:#9B9EAC;">$1</span>');

  // 5. 无序列表
  html = html.replace(/^[•·]\s+(.+)$/gm, '<div style="padding-left:16rpx;">• $1</div>');

  // 6. 有序列表（①②③ 保持原样）

  // 7. 换行处理
  html = html.replace(/\n\n/g, '<div style="height:12rpx;"></div>');
  html = html.replace(/\n/g, '<br/>');

  return html;
}

/**
 * 解析 Markdown 表格为 HTML table
 */
function parseTable(md) {
  const lines = md.split('\n');
  const result = [];
  let inTable = false;
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('|') && line.endsWith('|')) {
      // 跳过分隔行 |------|
      if (/^\|[\s\-:]+\|$/.test(line.replace(/\|/g, '|').replace(/[\s\-:]/g, ''))) {
        continue;
      }

      if (!inTable) {
        inTable = true;
        tableRows = [];
      }

      const cells = line.split('|').filter(c => c.trim() !== '');
      tableRows.push(cells.map(c => c.trim()));
    } else {
      if (inTable) {
        result.push(renderTable(tableRows));
        inTable = false;
        tableRows = [];
      }
      result.push(line);
    }
  }

  if (inTable) {
    result.push(renderTable(tableRows));
  }

  return result.join('\n');
}

/**
 * 渲染表格为 HTML
 */
function renderTable(rows) {
  if (rows.length === 0) return '';

  const headerStyle = 'style="padding:8rpx 12rpx;font-weight:600;font-size:24rpx;color:#5A5D6B;background:#F0F1F5;border-bottom:2rpx solid #E8EAF0;"';
  const cellStyle = 'style="padding:8rpx 12rpx;font-size:24rpx;border-bottom:1rpx solid #F0F1F5;"';
  const tableStyle = 'style="width:100%;border-collapse:collapse;margin:12rpx 0;border-radius:12rpx;overflow:hidden;background:#FAFBFC;"';

  let html = `<table ${tableStyle}>`;

  // 第一行作为表头
  if (rows.length > 0) {
    html += '<tr>';
    for (const cell of rows[0]) {
      html += `<th ${headerStyle}>${cell}</th>`;
    }
    html += '</tr>';
  }

  // 其余行作为数据
  for (let i = 1; i < rows.length; i++) {
    html += '<tr>';
    for (const cell of rows[i]) {
      html += `<td ${cellStyle}>${cell}</td>`;
    }
    html += '</tr>';
  }

  html += '</table>';
  return html;
}

module.exports = { parseMarkdown };
