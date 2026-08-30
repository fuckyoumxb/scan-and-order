// 状态机与默认菜单（默认菜单仅作离线兜底，线上以服务端 /api/menu 为准）
export const STATUS = {
  pending:   { label: "待制作", color: "#ff6b35" },
  preparing: { label: "制作中", color: "#f5a623" },
  ready:     { label: "已出餐", color: "#3b9eff" },
  done:      { label: "已完成", color: "#34c759" }
};
export const STATUS_FLOW = ["pending", "preparing", "ready", "done"];

export const MENU = [
  { category: "招牌热菜", items: [
    { id: "h1", name: "红烧肉", desc: "肥而不腻 入口即化", price: 38, emoji: "🍖", img: "" },
    { id: "h2", name: "宫保鸡丁", desc: "微辣 花生脆爽", price: 28, emoji: "🍗", img: "" },
    { id: "h3", name: "麻婆豆腐", desc: "麻辣鲜香", price: 22, emoji: "🌶️", img: "" }
  ]},
  { category: "主食", items: [
    { id: "s1", name: "米饭", desc: "东北珍珠米", price: 3, emoji: "🍚", img: "" },
    { id: "s2", name: "牛肉面", desc: "手工拉面", price: 18, emoji: "🍜", img: "" }
  ]},
  { category: "饮品", items: [
    { id: "d1", name: "可乐", desc: "冰镇 330ml", price: 6, emoji: "🥤", img: "" },
    { id: "d2", name: "鲜榨橙汁", desc: "无添加", price: 12, emoji: "🍊", img: "" }
  ]},
  { category: "甜点", items: [
    { id: "c1", name: "提拉米苏", desc: "经典意式", price: 16, emoji: "🍰", img: "" }
  ]}
];
