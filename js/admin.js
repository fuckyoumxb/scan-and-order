import { MenuStore, uploadImage } from "./api.js";

function esc(s) {
  return String(s == null ? "" : s).replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const FALLBACK = [
  { category: "招牌热菜", items: [{ id: "h1", name: "红烧肉", desc: "肥而不腻", price: 38, emoji: "🍖", img: "" }] }
];

let menu = [];

function uid() { return "x" + Date.now().toString(36) + Math.floor(Math.random() * 1000); }

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1500);
}

function render() {
  const root = document.getElementById("cats");
  root.innerHTML = "";
  menu.forEach((cat, ci) => {
    const card = document.createElement("div");
    card.className = "cat-card";
    const name = document.createElement("input");
    name.className = "cat-name";
    name.value = cat.category;
    name.oninput = () => (cat.category = name.value);
    card.appendChild(name);

    cat.items.forEach((it, ii) => {
      const row = document.createElement("div");
      row.className = "it-row";
      row.innerHTML = `
        <input class="emoji-in" value="${esc(it.emoji)}" maxlength="2" />
        <input class="name-in" value="${esc(it.name)}" placeholder="名称" />
        <input class="price-in" type="number" value="${it.price}" placeholder="价格" />
        <button class="del">✕</button>
        <input class="desc-in" value="${esc(it.desc)}" placeholder="描述" />
        <div class="img-row">
          <input class="img-in" value="${esc(it.img)}" placeholder="图片URL（可选）" />
          <input class="img-file" type="file" accept="image/*" />
          <img class="img-thumb" ${it.img ? `src="${esc(it.img)}"` : ""} alt="" />
        </div>`;
      const emojiIn = row.querySelector(".emoji-in");
      const nameIn = row.querySelector(".name-in");
      const priceIn = row.querySelector(".price-in");
      const del = row.querySelector(".del");
      const descIn = row.querySelector(".desc-in");
      const imgIn = row.querySelector(".img-in");
      const imgFile = row.querySelector(".img-file");
      const thumb = row.querySelector(".img-thumb");
      emojiIn.oninput = () => (it.emoji = emojiIn.value);
      nameIn.oninput = () => (it.name = nameIn.value);
      priceIn.oninput = () => (it.price = Number(priceIn.value) || 0);
      descIn.oninput = () => (it.desc = descIn.value);
      imgIn.oninput = () => { it.img = imgIn.value; if (it.img) thumb.src = it.img; };
      // 自主上传菜品图片 → Supabase Storage
      imgFile.onchange = async () => {
        const f = imgFile.files && imgFile.files[0];
        if (!f) return;
        toast("上传中…");
        try {
          const url = await uploadImage(f);
          it.img = url; imgIn.value = url; thumb.src = url;
          toast("图片已上传，记得点保存");
        } catch (e) {
          console.error(e);
          toast("上传失败：" + (e.message || e));
        }
      };
      del.onclick = () => { cat.items.splice(ii, 1); render(); };
      card.appendChild(row);
    });

    const addIt = document.createElement("span");
    addIt.className = "add-it";
    addIt.textContent = "+ 添加菜品";
    addIt.onclick = () => {
      cat.items.push({ id: uid(), name: "新菜品", desc: "", price: 0, emoji: "🍽️", img: "" });
      render();
    };
    card.appendChild(addIt);
    root.appendChild(card);
  });
}

document.getElementById("addCat").onclick = () => {
  menu.push({ category: "新分类", items: [{ id: uid(), name: "新菜品", desc: "", price: 0, emoji: "🍽️", img: "" }] });
  render();
};

async function save() {
  await MenuStore.save(menu);
  toast("已保存并同步");
}
document.getElementById("saveBtn").onclick = save;
document.getElementById("saveTop").onclick = save;
document.getElementById("resetBtn").onclick = async () => {
  const m = await MenuStore.load();
  menu = (m && m.length) ? JSON.parse(JSON.stringify(m)) : JSON.parse(JSON.stringify(FALLBACK));
  render();
  toast("已重置");
};

// 初始加载
(async () => {
  const m = await MenuStore.load();
  menu = (m && m.length) ? JSON.parse(JSON.stringify(m)) : JSON.parse(JSON.stringify(FALLBACK));
  render();
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
