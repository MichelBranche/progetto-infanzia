const base = "https://streamingcommunityz.tech";
const html = await fetch(`${base}/it/search?q=avatar`).then((r) => r.text());
const page = JSON.parse(html.match(/data-page="([^"]+)"/)[1].replace(/&quot;/g, '"'));
console.log("component", page.component);
console.log("props keys", Object.keys(page.props));
const titles = page.props.titles || page.props.results || page.props.items;
console.log("titles count", titles?.length);
if (titles?.[0]) console.log("sample", JSON.stringify(titles[0], null, 2).slice(0, 800));
