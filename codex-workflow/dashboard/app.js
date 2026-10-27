"use strict";
const roles = {lead: "Trưởng nhóm", implement: "Triển khai", review: "Review / kiểm thử"};
const statuses = {planned: "Đã lên kế hoạch", working: "Đang làm", review: "Đang kiểm tra", blocked: "Đang vướng", done: "Hoàn tất", idle: "Chưa thực hiện"};
const phases = {analysis: "Phân tích", implementation: "Triển khai", verification: "Kiểm chứng", handoff: "Bàn giao"};
let state = null;
let selectedTab = "checks";
let fetching = false;
const byId = (id) => document.getElementById(id);
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const setText = (id, value) => { byId(id).textContent = value; };
const formatTime = (value) => value ? new Date(value).toLocaleString("vi-VN", {timeZone: "Asia/Bangkok", hour12: false}) : "Chưa cập nhật";
const badge = (status, label) => element("span", `badge ${status}`, label || statuses[status] || status);
const empty = (message) => element("div", "empty", message);

function renderRoles() {
  const container = byId("roles");
  container.replaceChildren();
  for (const [role, name] of Object.entries(roles)) {
    const report = state.roles[role];
    const card = element("article", "role-card");
    const top = element("div", "role-top");
    const identity = element("div");
    identity.append(element("h3", "", name), element("small", "", "Vai trò trong quy trình"));
    top.append(element("span", `avatar ${role}`, {lead: "L", implement: "A", review: "R"}[role]), identity, badge(report?.status || "idle", report ? undefined : "Chưa báo cáo"));
    card.append(top, element("p", "role-action", report?.action || "Chưa có cập nhật từ vai trò này. Không suy ra có một phiên riêng đang chạy."));
    const meta = element("div", "role-meta");
    meta.append(element("div", "", `Giai đoạn: ${phases[report?.phase] || "Chưa khai báo"}`), element("div", "", `Model: ${report?.model || "Chưa khai báo"}`), element("div", "", `Cập nhật: ${formatTime(report?.updated_at)}`));
    card.append(meta);
    if (report?.updated_at && Date.now() - new Date(report.updated_at).getTime() > 15 * 60 * 1000 && ["working", "review"].includes(report.status)) card.append(element("p", "stale", "Chưa có cập nhật mới trong hơn 15 phút; chưa xác minh còn đang làm."));
    if (report?.blocker) card.append(element("p", "blocker", `Vướng: ${report.blocker}`));
    if (report?.next) card.append(element("div", "next-step", `Tiếp theo → ${report.next}`));
    container.append(card);
  }
}

function renderEvidence() {
  const container = byId("evidence-list");
  container.replaceChildren();
  const reports = Object.entries(state.roles);
  if (selectedTab === "checks") {
    for (const [role, report] of reports) for (const check of report.checks || []) {
      const row = element("div", "evidence-row");
      const label = element("div", "evidence-label", check.label);
      label.append(element("small", "", `${roles[role]} · báo cáo kiểm tra`));
      row.append(badge(check.status), label);
      container.append(row);
    }
  } else if (selectedTab === "files") {
    const files = new Map();
    for (const [role, report] of reports) for (const file of report.files || []) files.set(file, [...(files.get(file) || []), roles[role]]);
    for (const [file, owners] of files) {
      const row = element("div", "evidence-row");
      const button = element("button", "file-button", file);
      button.type = "button";
      button.addEventListener("click", () => openFile(file));
      const label = element("div", "evidence-label");
      label.append(button, element("small", "", owners.join(" · ")));
      row.append(element("span", "", "↗"), label);
      container.append(row);
    }
  } else {
    for (const [role, report] of reports) for (const url of report.artifacts || []) {
      let parsed;
      try { parsed = new URL(url); } catch { continue; }
      if (!["http:", "https:"].includes(parsed.protocol)) continue;
      const row = element("div", "evidence-row");
      const label = element("div", "evidence-label");
      const link = element("a", "file-button", url);
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      label.append(link, element("small", "", `${roles[role]} · mở liên kết để kiểm chứng`));
      row.append(element("span", "", "↗"), label);
      container.append(row);
    }
  }
  if (!container.children.length) container.append(empty({checks: "Chưa có kết quả kiểm tra được báo cáo.", files: "Chưa khai báo file phụ trách.", demos: "Chưa có liên kết demo. Các file local có thể xem ở tab File phụ trách."}[selectedTab]));
}

function render() {
  const task = state.task;
  setText("task-title", task?.title || "Chưa khởi tạo nhiệm vụ");
  setText("task-goal", task?.goal || "Các phiên báo tiến độ qua dashboard.py để bắt đầu.");
  byId("task-status").className = `badge ${task?.status || "idle"}`;
  setText("task-status", task ? statuses[task.status] : "Chưa có task");
  setText("task-id", task ? `TASK / ${task.id}` : "Chưa có mã nhiệm vụ");
  setText("last-update", `Báo cáo gần nhất: ${formatTime(state.updated_at)}`);
  byId("criteria").replaceChildren(...(task?.criteria || []).map((item) => element("span", "", item)));
  const reports = Object.values(state.roles);
  const checks = reports.flatMap((report) => report.checks || []);
  setText("working-count", reports.filter((r) => ["working", "review"].includes(r.status)).length);
  setText("blocked-count", reports.filter((r) => r.status === "blocked").length);
  setText("pass-count", checks.filter((c) => c.status === "PASS").length);
  setText("check-detail", checks.length ? `${checks.filter((c) => c.status === "FAIL").length} lỗi · ${checks.filter((c) => c.status === "NOT_RUN").length} chưa chạy` : "Chưa có bằng chứng kiểm tra");
  setText("file-count", new Set(reports.flatMap((r) => r.files || [])).size);
  renderRoles();
  renderEvidence();
  byId("events").replaceChildren(...(state.events || []).map((event) => {
    const item = element("div", "event", event.message);
    item.append(element("small", "", `${roles[event.role] || event.role} · ${formatTime(event.at)}`));
    return item;
  }));
  if (!state.events?.length) byId("events").append(empty("Chưa có mốc cập nhật."));
  setText("note-content", state.note);
  setText("sync-time", `Lần đọc thành công: ${formatTime(state.served_at)}`);
}

async function openFile(path) {
  const dialog = byId("file-dialog");
  setText("file-title", path);
  setText("file-content", "Đang đọc file…");
  dialog.showModal();
  try {
    const response = await fetch(`/api/file?path=${encodeURIComponent(path)}`, {cache: "no-store", signal: AbortSignal.timeout(10000)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Không đọc được file");
    setText("file-content", data.content);
  } catch (error) { setText("file-content", error.message); }
}

async function refresh() {
  if (fetching) return;
  fetching = true;
  try {
    const response = await fetch("/api/state", {cache: "no-store", signal: AbortSignal.timeout(10000)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Không đọc được dashboard");
    state = data;
    render();
    byId("error").hidden = true;
    setText("connection", "Đã kết nối local");
    byId("connection-dot").className = "dot";
  } catch (error) {
    byId("error").hidden = false;
    setText("error", `Không tải được cập nhật: ${error.message}. Dữ liệu đang hiển thị có thể đã cũ.`);
    setText("connection", "Mất kết nối");
    byId("connection-dot").className = "dot offline";
  } finally { fetching = false; }
}

document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
  selectedTab = button.dataset.tab;
  document.querySelectorAll("[data-tab]").forEach((tab) => tab.classList.toggle("selected", tab === button));
  if (state) renderEvidence();
}));
byId("refresh").addEventListener("click", refresh);
byId("toggle-note").addEventListener("click", () => {
  const expanded = byId("note-content").hidden;
  byId("note-content").hidden = !expanded;
  byId("toggle-note").setAttribute("aria-expanded", String(expanded));
  setText("toggle-note", expanded ? "Thu gọn ↑" : "Xem note ↓");
});
byId("close-file").addEventListener("click", () => byId("file-dialog").close());
refresh();
setInterval(refresh, 3000);
