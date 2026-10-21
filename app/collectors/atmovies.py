"""開眼電影網（www.atmovies.com.tw）的解析（規格書 4.3、7.2，討論紀錄「第二階段開始前的查證」）。

- 只有今天和之後 1～2 天的場次；每天 06:00、18:00 抓（2026-10-20 決定）
- 報告註明「僅供學術展示」；每頁間隔幾秒、User-Agent 帶專案名稱（2026-10-20 決定照抓）
- 一般場次沒有版本文字；特殊廳和語言才有，例如「IMAX」「國語版」
- 時間的冒號是全形「：」；00:00～04:59 開演的是隔天凌晨的場次
- 分級是圖檔名：cer_G、cer_P、cer_F2、cer_F5、cer_R（對應是推測，網站上沒有文字說明）
"""

import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

TZ = ZoneInfo("Asia/Taipei")
BASE = "https://www.atmovies.com.tw"
REGION = "a03"  # 桃園中壢
USER_AGENT = "ZeroGap/0.1 (student project; academic demo only)"
NEXT_DAY_BEFORE = time(5, 0)

RATINGS = {"G": "普遍級", "P": "保護級", "F2": "輔12級", "F5": "輔15級", "R": "限制級"}
AREAS_BY_DISTRICT = {
    "桃園區": "taoyuan",
    "中壢區": "zhongli",
    "八德區": "bade",
    "蘆竹區": "luzhu",
    "蘆竹鄉": "luzhu",  # 開眼還寫升格前的「鄉」
}
CHAINS = {"威秀": "vieshow", "秀泰": "showtime", "國賓": "ambassador", "新光": "skcinemas",
          "in89": "in89"}  # fmt: skip
# 影城不收：只有節目表圖片，抓不到場次。要寫完整：「新光影城」裡也有「光影」兩個字
SKIP_THEATERS = ("光影文化館", "光影電影館")

# 版本文字 → 影廳（先比對到的優先）【預設】
HALLS = [
    ("imax", ("IMAX",)),
    ("4dx", ("4DX",)),
    ("screenx", ("SCREENX",)),
    ("mx4d", ("MX4D",)),
    ("dbox", ("D-BOX", "DBOX")),
    ("dolby", ("DOLBY CINEMA", "杜比影院")),
    ("titan", ("TITAN", "ATMOS", "杜比全景聲")),
    ("premium", ("皇家廳", "MUCROWN", "尊爵", "貴賓", "PREMIUM")),
]
LANGUAGES = [
    ("中文", ("國語", "中文", "華語")),
    ("日語", ("日語", "日文")),
    ("英語", ("英語", "英文")),
    ("韓語", ("韓語", "韓文")),
    ("粵語", ("粵語",)),
]
_TIME = re.compile(r"^(\d{1,2})：(\d{2})$")
_RUNTIME = re.compile(r"片長：\s*(\d+)\s*分")
_RATING = re.compile(r"cer_([A-Z0-9]+)\.gif")
_DAY_LINK = re.compile(r"/showtime/t\d+/a\d+/(\d{8})/")
_MOVIE_LINK = re.compile(r"/movie/(f[A-Za-z0-9]+)/")


@dataclass(frozen=True)
class TheaterInfo:
    atmovies_id: str
    name: str
    address: str | None


@dataclass(frozen=True)
class FilmShowing:
    movie_id: str
    title: str
    runtime_min: int | None
    rating: str | None
    version_raw: str
    times: list[time]


@dataclass(frozen=True)
class TheaterPage:
    name: str
    address: str | None
    day: date
    other_days: list[date]
    films: list[FilmShowing] = field(default_factory=list)


@dataclass(frozen=True)
class MovieInfo:
    title: str
    runtime_min: int | None
    rating: str | None
    language_raw: str | None
    country: str | None
    synopsis: str | None


def theater_url(atmovies_id: str, day: date | None = None) -> str:
    suffix = f"{day:%Y%m%d}/" if day else ""
    return f"{BASE}/showtime/{atmovies_id}/{REGION}/{suffix}"


def movie_url(movie_id: str) -> str:
    return f"{BASE}/movie/{movie_id}/"


def _soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def _rating(soup_part) -> str | None:
    for img in soup_part.find_all("img"):
        m = _RATING.search(img.get("src", ""))
        if m:
            return RATINGS.get(m.group(1))
    return None


def parse_theater_list(html: str) -> list[TheaterInfo]:
    ul = _soup(html).select_one("#theaterList")
    out = []
    for li in ul.find_all("li", recursive=False) if ul else []:
        a = li.find("a", href=re.compile(r"/showtime/t\d+/"))
        if not a:
            continue
        tid = re.search(r"/showtime/(t\d+)/", a["href"]).group(1)
        details = [x.get_text(" ", strip=True) for x in li.select("ul li")]
        out.append(TheaterInfo(tid, a.get_text(strip=True), details[0] if details else None))
    return out


def parse_theater_page(html: str) -> TheaterPage:
    soup = _soup(html)
    name = soup.select_one("h2").get_text(strip=True)
    address = None
    info = soup.select_one("h2").find_next("ul")
    for li in info.find_all("li") if info else []:
        text = li.get_text(" ", strip=True)
        if text.startswith("地址"):
            address = re.sub(r"^地址\s*[:：]\s*", "", text).replace("(地圖)", "").strip()
            break
    day = datetime.strptime(soup.select_one("h3").get_text(strip=True)[:10], "%Y/%m/%d").date()
    other_days = sorted(
        {datetime.strptime(m.group(1), "%Y%m%d").date()
         for a in soup.find_all("a", href=True) if (m := _DAY_LINK.search(a["href"]))}
        - {day}
    )  # fmt: skip

    films = []
    for table in soup.select("ul#theaterShowtimeTable"):
        link = table.select_one("li.filmTitle a")
        m = _MOVIE_LINK.search(link["href"]) if link else None
        if not m:
            continue
        version = table.select_one("li.filmVersion")
        runtime = _RUNTIME.search(table.get_text(" "))
        times: list[time] = []
        for li in table.find_all("li"):
            t = _TIME.match(li.get_text(strip=True))
            if t:
                value = time(int(t.group(1)) % 24, int(t.group(2)))
                if value not in times:
                    times.append(value)
        films.append(
            FilmShowing(
                movie_id=m.group(1),
                title=link.get_text(strip=True),
                runtime_min=int(runtime.group(1)) if runtime else None,
                rating=_rating(table),
                version_raw=version.get_text(strip=True) if version else "",
                times=times,
            )
        )
    return TheaterPage(name, address, day, other_days, films)


def showtimes_of(film: FilmShowing, day: date) -> list[datetime]:
    """00:00～04:59 開演的是隔天凌晨的場次。"""
    out = []
    for t in film.times:
        d = day + timedelta(days=1) if t < NEXT_DAY_BEFORE else day
        out.append(datetime.combine(d, t, TZ))
    return out


def parse_version(raw: str) -> tuple[str, str | None]:
    """版本文字 → (影廳代碼, 語言)。對不上的影廳算 standard，語言是 None（用電影本身的語言）。"""
    upper = raw.upper()
    hall = next((code for code, keys in HALLS if any(k.upper() in upper for k in keys)), "standard")
    language = next((lang for lang, keys in LANGUAGES if any(k in raw for k in keys)), None)
    return hall, language


def area_from_address(address: str | None) -> str | None:
    for district, area in AREAS_BY_DISTRICT.items():
        if address and district in address:
            return area
    return None


def chain_from_name(name: str) -> str | None:
    """從影城名稱的關鍵字判斷品牌（4.3【預設】）。"""
    return next((code for key, code in CHAINS.items() if key.lower() in name.lower()), None)


def _label_value(soup: BeautifulSoup, label: str) -> str | None:
    """「語　　言：English」這種欄位；標籤中間夾了全形空白或 &nbsp;。"""
    text = soup.get_text("\n")
    pattern = r"\s*".join(label) + r"\s*：\s*\n?\s*([^\n]+)"
    m = re.search(pattern, text.replace("\xa0", " ").replace("　", " "))
    return m.group(1).strip() if m else None


def parse_movie(html: str) -> MovieInfo:
    soup = _soup(html)
    ld: dict = {}
    script = soup.select_one('script[type="application/ld+json"]')
    if script and script.string:
        try:
            ld, _ = json.JSONDecoder(strict=False).raw_decode(script.string.strip())
        except ValueError:
            ld = {}
    title_div = soup.select_one("div.filmTitle")
    full_title = title_div.get_text(" ", strip=True) if title_div else ld.get("name", "")
    # 「快打旋風 Street Fighter」→ 取中文片名（第一個空白前；全英文片名就整個用）
    title = re.split(r"\s+(?=[A-Za-z])", full_title, maxsplit=1)[0] if full_title else ""
    runtime = None
    if ld.get("duration") and re.fullmatch(r"\d+:\d{2}", ld["duration"]):
        h, mm = ld["duration"].split(":")
        runtime = int(h) * 60 + int(mm)
    elif m := _RUNTIME.search(soup.get_text(" ")):
        runtime = int(m.group(1))
    return MovieInfo(
        title=title or full_title,
        runtime_min=runtime,
        rating=_rating(title_div) if title_div else None,
        language_raw=_label_value(soup, "語言"),
        country=_label_value(soup, "出品國"),
        synopsis=(ld.get("description") or "").strip() or None,
    )
