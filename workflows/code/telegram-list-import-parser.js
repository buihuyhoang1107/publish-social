const parseImportList = input => {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const items = [];
  const codePattern = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
  const add = (code, caption, fileName) => {
    code = code.trim().toUpperCase();
    caption = caption.trim();
    if (!codePattern.test(code)) throw new Error('Mã bài chỉ gồm chữ, số, gạch ngang hoặc gạch dưới; ví dụ POST01.');
    if (!caption) throw new Error(`Bài ${code} chưa có nội dung.`);
    if (Array.from(caption).length > 4096) throw new Error(`Bài ${code} vượt 4.096 ký tự. Hãy rút gọn nội dung.`);
    if (items.some(item => item.code === code)) throw new Error(`Mã ${code} bị lặp trong danh sách. Mỗi mã chỉ dùng một lần.`);
    if (fileName && (!/^[^/\\\x00-\x1f]+\.(png|jpe?g|webp|mp4|mov|webm)$/i.test(fileName) || fileName.length > 180)) throw new Error(`Tên file của ${code} không hợp lệ. Chỉ ghi tên ảnh JPG/PNG/WEBP hoặc video MP4/MOV/WEBM, không ghi đường dẫn.`);
    items.push({ code, caption, ...(fileName ? { fileName } : {}) });
  };
  if (text.trimStart().startsWith('|')) {
    const lines = text.trim().split('\n');
    if (lines.length < 3 || !/\|/.test(lines[1]) || !/^\s*\|?[\s:|\-]+\|?\s*$/.test(lines[1])) throw new Error('Bảng cần 3 cột: Mã bài | Tên file | Content đăng bài.');
    for (const line of lines.slice(2)) {
      if (!line.trim()) continue;
      const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
      if (cells.length !== 3) throw new Error('Mỗi dòng bảng cần đúng 3 cột: Mã bài | Tên file | Content đăng bài.');
      add(cells[0], cells[2].replace(/<br\s*\/?>/gi, '\n'), cells[1]);
    }
  } else {
    const headers = [...text.matchAll(/^\[([A-Za-z][A-Za-z0-9_-]{0,39})\][ \t]*$/gm)];
    if (!headers.length || text.slice(0, headers[0].index).trim()) throw new Error('Gửi nội dung theo mẫu:\n[POST01]\nCaption bài 1…\n\n[POST02]\nCaption bài 2…\n\nHoặc dán bảng 3 cột: Mã bài | Tên file | Content đăng bài.');
    for (let index = 0; index < headers.length; index++) {
      const header = headers[index];
      add(header[1], text.slice(header.index + header[0].length, headers[index + 1]?.index ?? text.length));
    }
  }
  if (!items.length || items.length > 1000) throw new Error('Danh sách cần từ 1 đến 1.000 bài.');
  return items;
};
