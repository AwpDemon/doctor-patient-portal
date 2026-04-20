"""
Renders README screenshots for the HealthBridge portal.

These aren't live-captured renders — the deployment pipeline is gone. They're
constructed from the real design system tokens in public/css/styles.css so the
visual language matches what the app actually looks like when it's running
(same palette, layout, typography, iconography).

Output: docs/screenshots/{login,patient-dashboard,doctor-dashboard,
        appointments,messages,prescriptions}.png at 1440x900.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# ---- Design tokens (from public/css/styles.css) ----
PRIMARY_50  = (239, 246, 255)
PRIMARY_100 = (219, 234, 254)
PRIMARY_500 = ( 59, 130, 246)
PRIMARY_600 = ( 37,  99, 235)
PRIMARY_700 = ( 29,  78, 216)
PRIMARY_800 = ( 30,  64, 175)
PRIMARY_900 = ( 30,  58, 138)

ACCENT_500 = ( 20, 184, 166)
ACCENT_600 = ( 13, 148, 136)

GRAY_50  = (248, 250, 252)
GRAY_100 = (241, 245, 249)
GRAY_200 = (226, 232, 240)
GRAY_300 = (203, 213, 225)
GRAY_400 = (148, 163, 184)
GRAY_500 = (100, 116, 139)
GRAY_600 = ( 71,  85, 105)
GRAY_700 = ( 51,  65,  85)
GRAY_800 = ( 30,  41,  59)
GRAY_900 = ( 15,  23,  42)
WHITE    = (255, 255, 255)

SUCCESS       = ( 16, 185, 129)
SUCCESS_LIGHT = (209, 250, 229)
WARNING       = (245, 158,  11)
WARNING_LIGHT = (254, 243, 199)
DANGER        = (239,  68,  68)
DANGER_LIGHT  = (254, 226, 226)
INFO_LIGHT    = (219, 234, 254)

W, H = 1440, 900
SIDEBAR_W = 240
TOPBAR_H  = 64

OUT = Path(__file__).resolve().parent / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

FONT_PATH = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"

def f(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_PATH, size)


def rounded_rect(draw, xy, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def card_shadow(img, xy, radius=12):
    x1, y1, x2, y2 = xy
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    for i in range(6, 0, -1):
        alpha = int(6 * (7 - i))
        sd.rounded_rectangle(
            (x1 - i, y1 - i + 2, x2 + i, y2 + i + 2),
            radius=radius + i, fill=(15, 23, 42, alpha),
        )
    img.alpha_composite(shadow)


def base_canvas(bg=GRAY_100):
    im = Image.new("RGBA", (W, H), bg + (255,))
    return im, ImageDraw.Draw(im)


# ---- Chrome: sidebar + topbar ----
def draw_sidebar(d, active_idx, items):
    d.rectangle((0, 0, SIDEBAR_W, H), fill=GRAY_900)
    # logo block
    d.text((24, 24), "⛨  HealthBridge", font=f(18, bold=True), fill=WHITE)
    d.text((24, 48), "Patient-Doctor Portal", font=f(11), fill=GRAY_400)
    # divider
    d.rectangle((16, 84, SIDEBAR_W - 16, 85), fill=GRAY_800)

    y = 104
    for i, (icon, label) in enumerate(items):
        if i == active_idx:
            rounded_rect(d, (12, y - 6, SIDEBAR_W - 12, y + 28), 8, fill=PRIMARY_600)
            text_color = WHITE
        else:
            text_color = GRAY_300
        d.text((28, y + 2), f"{icon}  {label}", font=f(13), fill=text_color)
        y += 44

    # user card bottom
    y = H - 92
    rounded_rect(d, (12, y, SIDEBAR_W - 12, y + 72), 10, fill=GRAY_800)
    d.ellipse((24, y + 14, 68, y + 58), fill=PRIMARY_500)
    d.text((32, y + 22), "JD", font=f(16, bold=True), fill=WHITE)
    d.text((80, y + 16), "John Doe", font=f(13, bold=True), fill=WHITE)
    d.text((80, y + 36), "Patient", font=f(11), fill=GRAY_400)


def draw_topbar(d, title, breadcrumb=None):
    d.rectangle((SIDEBAR_W, 0, W, TOPBAR_H), fill=WHITE)
    d.rectangle((SIDEBAR_W, TOPBAR_H - 1, W, TOPBAR_H), fill=GRAY_200)
    d.text((SIDEBAR_W + 32, 18), title, font=f(18, bold=True), fill=GRAY_900)
    if breadcrumb:
        d.text((SIDEBAR_W + 32, 42), breadcrumb, font=f(12), fill=GRAY_500)
    # right controls
    rounded_rect(d, (W - 360, 16, W - 210, 48), 8, fill=GRAY_100)
    d.text((W - 352, 24), "🔍  Search...", font=f(12), fill=GRAY_500)
    # notification
    rounded_rect(d, (W - 196, 16, W - 156, 48), 8, fill=GRAY_100)
    d.text((W - 184, 22), "🔔", font=f(16), fill=GRAY_700)
    d.ellipse((W - 172, 16, W - 162, 26), fill=DANGER)
    # avatar
    d.ellipse((W - 136, 16, W - 96, 56), fill=PRIMARY_500)
    d.text((W - 126, 26), "JD", font=f(13, bold=True), fill=WHITE)
    d.text((W - 88, 22), "John Doe", font=f(12, bold=True), fill=GRAY_900)
    d.text((W - 88, 40), "Patient", font=f(10), fill=GRAY_500)


# ---- 1. LOGIN ----
def render_login():
    im, d = base_canvas(bg=PRIMARY_50)
    # Gradient background
    for y in range(H):
        t = y / H
        r = int(PRIMARY_50[0] * (1 - t) + PRIMARY_100[0] * t)
        g = int(PRIMARY_50[1] * (1 - t) + PRIMARY_100[1] * t)
        b = int(PRIMARY_50[2] * (1 - t) + PRIMARY_100[2] * t)
        d.line((0, y, W, y), fill=(r, g, b))

    # auth card
    cw, ch = 480, 620
    cx = (W - cw) // 2
    cy = (H - ch) // 2
    card_shadow(im, (cx, cy, cx + cw, cy + ch), radius=16)
    rounded_rect(d, (cx, cy, cx + cw, cy + ch), 16, fill=WHITE)

    # header
    d.ellipse((cx + cw // 2 - 32, cy + 36, cx + cw // 2 + 32, cy + 100),
              fill=PRIMARY_600)
    d.text((cx + cw // 2 - 16, cy + 52), "⛨", font=f(28, bold=True), fill=WHITE)
    d.text((cx + cw // 2 - 88, cy + 118), "HealthBridge",
           font=f(24, bold=True), fill=GRAY_900)
    d.text((cx + cw // 2 - 92, cy + 154), "Patient-Doctor Portal",
           font=f(13), fill=GRAY_500)

    # form fields
    fx = cx + 40
    fw = cw - 80
    y = cy + 200

    d.text((fx, y), "Email Address", font=f(12, bold=True), fill=GRAY_700)
    rounded_rect(d, (fx, y + 22, fx + fw, y + 64), 8,
                 outline=GRAY_300, width=1)
    d.text((fx + 16, y + 36), "✉  john.doe@email.com", font=f(13), fill=GRAY_700)

    y += 96
    d.text((fx, y), "Password", font=f(12, bold=True), fill=GRAY_700)
    rounded_rect(d, (fx, y + 22, fx + fw, y + 64), 8,
                 outline=GRAY_300, width=1)
    d.text((fx + 16, y + 36), "🔒  ••••••••••••", font=f(13), fill=GRAY_700)

    # button
    y += 96
    rounded_rect(d, (fx, y, fx + fw, y + 44), 8, fill=PRIMARY_600)
    d.text((fx + fw // 2 - 36, y + 14), "Sign In", font=f(14, bold=True), fill=WHITE)

    # links
    y += 64
    d.text((fx, y), "Forgot password?", font=f(12), fill=PRIMARY_600)
    d.text((fx + fw - 128, y), "Create an account", font=f(12), fill=PRIMARY_600)

    # demo info box
    y += 36
    rounded_rect(d, (fx, y, fx + fw, y + 92), 8, fill=GRAY_50)
    d.text((fx + 16, y + 10), "Demo Credentials", font=f(11, bold=True), fill=GRAY_700)
    d.text((fx + 16, y + 30), "Admin:    admin@healthbridge.com", font=f(10), fill=GRAY_600)
    d.text((fx + 16, y + 46), "Doctor:   dr.chen@healthbridge.com", font=f(10), fill=GRAY_600)
    d.text((fx + 16, y + 62), "Patient:  john.doe@email.com", font=f(10), fill=GRAY_600)
    d.text((fx + 16, y + 78), "Password: Password123", font=f(10), fill=GRAY_600)

    im.convert("RGB").save(OUT / "login.png", "PNG", optimize=True)


# ---- 2. PATIENT DASHBOARD ----
def render_patient_dashboard():
    im, d = base_canvas()
    items = [("📊", "Dashboard"), ("📅", "Appointments"), ("✉", "Messages"),
             ("📋", "Prescriptions"), ("🧪", "Lab Results"), ("💳", "Billing"),
             ("👤", "Profile"), ("⚙", "Settings")]
    draw_sidebar(d, 0, items)
    draw_topbar(d, "Welcome back, John", "Patient Dashboard")

    # stats cards
    cards = [
        ("3", "Upcoming Appointments", PRIMARY_600, "📅"),
        ("5", "Active Prescriptions",  ACCENT_600,  "📋"),
        ("2", "Unread Messages",       WARNING,     "✉"),
        ("$248", "Outstanding Balance", DANGER,     "💳"),
    ]
    cx0 = SIDEBAR_W + 32
    cw = 264
    cy0 = TOPBAR_H + 32
    for i, (val, lbl, color, icon) in enumerate(cards):
        x = cx0 + i * (cw + 16)
        rounded_rect(d, (x, cy0, x + cw, cy0 + 110), 12, fill=WHITE)
        rounded_rect(d, (x, cy0, x + cw, cy0 + 110), 12,
                     outline=GRAY_200, width=1)
        rounded_rect(d, (x + 16, cy0 + 20, x + 60, cy0 + 64), 10,
                     fill=color + (0,) if len(color) == 4 else color)
        d.text((x + 28, cy0 + 32), icon, font=f(16), fill=WHITE)
        d.text((x + 80, cy0 + 20), val, font=f(24, bold=True), fill=GRAY_900)
        d.text((x + 80, cy0 + 60), lbl, font=f(11), fill=GRAY_500)

    # upcoming appointments panel
    py = cy0 + 144
    rounded_rect(d, (cx0, py, cx0 + 760, py + 312), 12, fill=WHITE)
    rounded_rect(d, (cx0, py, cx0 + 760, py + 312), 12, outline=GRAY_200, width=1)
    d.text((cx0 + 24, py + 18), "Upcoming Appointments", font=f(15, bold=True), fill=GRAY_900)
    d.text((cx0 + 760 - 96, py + 22), "View all →", font=f(11), fill=PRIMARY_600)

    appts = [
        ("Tue, Apr 23", "10:30 AM", "Dr. Sarah Chen",    "Cardiology — Follow-up",  "Confirmed", SUCCESS,  SUCCESS_LIGHT),
        ("Fri, May 03", "02:00 PM", "Dr. Raj Patel",     "Annual Physical",         "Scheduled", PRIMARY_600, PRIMARY_100),
        ("Mon, May 20", "09:15 AM", "Dr. Amy Williams",  "Dermatology — Consult",   "Pending",   WARNING,  WARNING_LIGHT),
    ]
    ry = py + 56
    for date, time_, doc, reason, status, scolor, sbg in appts:
        rounded_rect(d, (cx0 + 24, ry, cx0 + 736, ry + 68), 8, fill=GRAY_50)
        rounded_rect(d, (cx0 + 40, ry + 12, cx0 + 116, ry + 56), 8, fill=PRIMARY_100)
        d.text((cx0 + 54, ry + 20), date.split(",")[0], font=f(11, bold=True), fill=PRIMARY_700)
        d.text((cx0 + 54, ry + 38), date.split(",")[1].strip(), font=f(11, bold=True), fill=PRIMARY_700)
        d.text((cx0 + 136, ry + 14), time_ + "   " + doc, font=f(13, bold=True), fill=GRAY_900)
        d.text((cx0 + 136, ry + 38), reason, font=f(11), fill=GRAY_500)
        rounded_rect(d, (cx0 + 610, ry + 22, cx0 + 710, ry + 46), 12, fill=sbg)
        d.text((cx0 + 624, ry + 28), status, font=f(11, bold=True), fill=scolor)
        ry += 80

    # right column: quick actions
    rx = cx0 + 776
    rounded_rect(d, (rx, py, rx + 344, py + 152), 12, fill=WHITE)
    rounded_rect(d, (rx, py, rx + 344, py + 152), 12, outline=GRAY_200, width=1)
    d.text((rx + 20, py + 18), "Quick Actions", font=f(14, bold=True), fill=GRAY_900)
    actions = [("📅  Book Appointment", PRIMARY_600), ("✉  Message Doctor", ACCENT_600)]
    for i, (lbl, color) in enumerate(actions):
        rounded_rect(d, (rx + 20, py + 52 + i * 42, rx + 324, py + 88 + i * 42), 8, fill=color)
        d.text((rx + 36, py + 60 + i * 42), lbl, font=f(12, bold=True), fill=WHITE)

    # lab results preview
    rounded_rect(d, (rx, py + 168, rx + 344, py + 312), 12, fill=WHITE)
    rounded_rect(d, (rx, py + 168, rx + 344, py + 312), 12, outline=GRAY_200, width=1)
    d.text((rx + 20, py + 186), "Recent Lab Results", font=f(14, bold=True), fill=GRAY_900)
    labs = [("HbA1c",     "5.7%",   "Normal",   SUCCESS_LIGHT, SUCCESS),
            ("Cholesterol", "182 mg/dL", "Normal", SUCCESS_LIGHT, SUCCESS),
            ("Vitamin D", "22 ng/mL", "Low",    WARNING_LIGHT, WARNING)]
    for i, (name, val, tag, bg, color) in enumerate(labs):
        ly = py + 220 + i * 28
        d.text((rx + 20, ly), name, font=f(11), fill=GRAY_700)
        d.text((rx + 160, ly), val, font=f(11, bold=True), fill=GRAY_900)
        rounded_rect(d, (rx + 252, ly - 2, rx + 316, ly + 16), 9, fill=bg)
        d.text((rx + 268, ly), tag, font=f(10, bold=True), fill=color)

    im.convert("RGB").save(OUT / "patient-dashboard.png", "PNG", optimize=True)


# ---- 3. DOCTOR DASHBOARD ----
def render_doctor_dashboard():
    im, d = base_canvas()
    items = [("📊", "Dashboard"), ("📅", "Schedule"), ("👥", "Patients"),
             ("✉", "Messages"), ("📋", "Prescriptions"), ("🧪", "Lab Orders"),
             ("📊", "Reports"), ("⚙", "Settings")]
    draw_sidebar(d, 0, items)
    draw_topbar(d, "Good morning, Dr. Chen", "Cardiology · Today")

    # stats
    cards = [
        ("12", "Today's Patients",   PRIMARY_600),
        ("3",  "Awaiting Review",    WARNING),
        ("27", "This Week",          ACCENT_600),
        ("2",  "Urgent Messages",    DANGER),
    ]
    cx0 = SIDEBAR_W + 32
    cw = 264
    cy0 = TOPBAR_H + 32
    for i, (val, lbl, color) in enumerate(cards):
        x = cx0 + i * (cw + 16)
        rounded_rect(d, (x, cy0, x + cw, cy0 + 96), 12, fill=WHITE)
        rounded_rect(d, (x, cy0, x + cw, cy0 + 96), 12, outline=GRAY_200, width=1)
        # left color bar
        rounded_rect(d, (x, cy0, x + 6, cy0 + 96), 0, fill=color)
        d.text((x + 24, cy0 + 22), val, font=f(28, bold=True), fill=GRAY_900)
        d.text((x + 24, cy0 + 62), lbl, font=f(11), fill=GRAY_500)

    # today's schedule
    py = cy0 + 128
    rounded_rect(d, (cx0, py, cx0 + 760, py + 360), 12, fill=WHITE)
    rounded_rect(d, (cx0, py, cx0 + 760, py + 360), 12, outline=GRAY_200, width=1)
    d.text((cx0 + 24, py + 18), "Today's Schedule · Apr 19", font=f(15, bold=True), fill=GRAY_900)

    slots = [
        ("08:30", "John Doe",        "Follow-up — HTN",      "Completed",   GRAY_400, GRAY_200),
        ("09:15", "Mary Smith",      "Cardiology consult",    "Completed",   GRAY_400, GRAY_200),
        ("10:00", "David Wilson",    "MRI results review",    "In progress", PRIMARY_600, PRIMARY_100),
        ("10:45", "Lisa Brown",      "Follow-up — Arrhythmia","Up next",     ACCENT_600, (204, 251, 241)),
        ("11:30", "James Taylor",    "New patient intake",    "Scheduled",   GRAY_500, GRAY_100),
        ("13:00", "Emma Garcia",     "Post-op check",         "Scheduled",   GRAY_500, GRAY_100),
    ]
    sy = py + 52
    for tm, patient, reason, status, scolor, sbg in slots:
        # time pill
        rounded_rect(d, (cx0 + 24, sy, cx0 + 80, sy + 28), 6, fill=PRIMARY_50)
        d.text((cx0 + 34, sy + 6), tm, font=f(12, bold=True), fill=PRIMARY_700)
        # patient
        d.text((cx0 + 100, sy + 2), patient, font=f(13, bold=True), fill=GRAY_900)
        d.text((cx0 + 100, sy + 18), reason, font=f(11), fill=GRAY_500)
        # status
        rounded_rect(d, (cx0 + 620, sy, cx0 + 730, sy + 28), 14, fill=sbg)
        d.text((cx0 + 632, sy + 7), status, font=f(11, bold=True), fill=scolor)
        sy += 48

    # messages + patient alerts
    rx = cx0 + 776
    rounded_rect(d, (rx, py, rx + 344, py + 172), 12, fill=WHITE)
    rounded_rect(d, (rx, py, rx + 344, py + 172), 12, outline=GRAY_200, width=1)
    d.text((rx + 20, py + 18), "Urgent Messages", font=f(14, bold=True), fill=GRAY_900)
    msgs = [("Lisa Brown",    "Chest pain returning...",   DANGER),
            ("David Wilson",  "Question about MRI",         WARNING)]
    for i, (name, snippet, color) in enumerate(msgs):
        my = py + 52 + i * 56
        d.ellipse((rx + 20, my, rx + 52, my + 32), fill=color)
        d.text((rx + 62, my), name, font=f(12, bold=True), fill=GRAY_900)
        d.text((rx + 62, my + 18), snippet, font=f(11), fill=GRAY_500)

    # alerts
    rounded_rect(d, (rx, py + 188, rx + 344, py + 360), 12, fill=WHITE)
    rounded_rect(d, (rx, py + 188, rx + 344, py + 360), 12, outline=GRAY_200, width=1)
    d.text((rx + 20, py + 206), "Patient Alerts", font=f(14, bold=True), fill=GRAY_900)
    alerts = [
        ("⚠ BP reading above threshold",  "Mary Smith · 2h ago",    WARNING_LIGHT, WARNING),
        ("✓ Lab results uploaded",         "David Wilson · 3h ago",  SUCCESS_LIGHT, SUCCESS),
        ("⓵ Prescription refill request",  "John Doe · 5h ago",     INFO_LIGHT,    PRIMARY_700),
    ]
    for i, (msg, meta, bg, color) in enumerate(alerts):
        ay = py + 240 + i * 38
        rounded_rect(d, (rx + 20, ay, rx + 324, ay + 32), 8, fill=bg)
        d.text((rx + 32, ay + 4), msg, font=f(11, bold=True), fill=color)
        d.text((rx + 32, ay + 18), meta, font=f(10), fill=GRAY_600)

    im.convert("RGB").save(OUT / "doctor-dashboard.png", "PNG", optimize=True)


# ---- 4. APPOINTMENTS ----
def render_appointments():
    im, d = base_canvas()
    items = [("📊", "Dashboard"), ("📅", "Appointments"), ("✉", "Messages"),
             ("📋", "Prescriptions"), ("🧪", "Lab Results"), ("💳", "Billing"),
             ("👤", "Profile"), ("⚙", "Settings")]
    draw_sidebar(d, 1, items)
    draw_topbar(d, "Appointments", "Book, reschedule, or cancel visits")

    cx0 = SIDEBAR_W + 32
    cy0 = TOPBAR_H + 32

    # Book button
    rounded_rect(d, (W - 220, cy0, W - 48, cy0 + 40), 8, fill=PRIMARY_600)
    d.text((W - 192, cy0 + 12), "+ Book Appointment", font=f(12, bold=True), fill=WHITE)

    # filter tabs
    tabs = [("Upcoming", 3, True), ("Past", 14, False), ("Cancelled", 2, False)]
    tx = cx0
    for label, count, active in tabs:
        if active:
            rounded_rect(d, (tx, cy0, tx + 140, cy0 + 40), 8, fill=PRIMARY_600)
            d.text((tx + 14, cy0 + 12), f"{label} ({count})", font=f(12, bold=True), fill=WHITE)
        else:
            rounded_rect(d, (tx, cy0, tx + 140, cy0 + 40), 8, outline=GRAY_300, width=1)
            d.text((tx + 14, cy0 + 12), f"{label} ({count})", font=f(12, bold=True), fill=GRAY_600)
        tx += 152

    # appointment cards
    ay = cy0 + 64
    appts = [
        ("Tue, Apr 23, 2026", "10:30 AM", "Dr. Sarah Chen",
         "Cardiology — Follow-up",
         "Main Clinic, Rm 204",
         "Confirmed",  SUCCESS,  SUCCESS_LIGHT),
        ("Fri, May 03, 2026", "02:00 PM", "Dr. Raj Patel",
         "Annual Physical",
         "Main Clinic, Rm 118",
         "Scheduled", PRIMARY_600, PRIMARY_100),
        ("Mon, May 20, 2026", "09:15 AM", "Dr. Amy Williams",
         "Dermatology — Consult",
         "Derm Annex, Rm 7",
         "Pending",   WARNING,  WARNING_LIGHT),
    ]

    panel_w = W - cx0 - 32
    for date, time_, doc, reason, loc, status, scolor, sbg in appts:
        rounded_rect(d, (cx0, ay, cx0 + panel_w, ay + 140), 12, fill=WHITE)
        rounded_rect(d, (cx0, ay, cx0 + panel_w, ay + 140), 12, outline=GRAY_200, width=1)
        rounded_rect(d, (cx0, ay, cx0 + 6, ay + 140), 0, fill=PRIMARY_600)
        # date block
        rounded_rect(d, (cx0 + 24, ay + 20, cx0 + 128, ay + 100), 10, fill=PRIMARY_50)
        pieces = date.split(", ")
        d.text((cx0 + 42, ay + 28), pieces[0], font=f(11), fill=PRIMARY_700)
        d.text((cx0 + 40, ay + 44), pieces[1], font=f(16, bold=True), fill=PRIMARY_700)
        d.text((cx0 + 46, ay + 70), pieces[2], font=f(11), fill=PRIMARY_700)
        # center
        d.text((cx0 + 152, ay + 22), f"🕐  {time_}", font=f(13, bold=True), fill=GRAY_700)
        d.text((cx0 + 152, ay + 48), doc, font=f(16, bold=True), fill=GRAY_900)
        d.text((cx0 + 152, ay + 74), reason, font=f(12), fill=GRAY_600)
        d.text((cx0 + 152, ay + 98), f"📍  {loc}", font=f(11), fill=GRAY_500)
        # status pill + actions
        rounded_rect(d, (cx0 + panel_w - 136, ay + 22, cx0 + panel_w - 24, ay + 48), 13, fill=sbg)
        d.text((cx0 + panel_w - 120, ay + 28), status, font=f(11, bold=True), fill=scolor)

        rounded_rect(d, (cx0 + panel_w - 260, ay + 94, cx0 + panel_w - 144, ay + 122), 7, outline=GRAY_300, width=1)
        d.text((cx0 + panel_w - 248, ay + 102), "Reschedule", font=f(11, bold=True), fill=GRAY_700)
        rounded_rect(d, (cx0 + panel_w - 128, ay + 94, cx0 + panel_w - 24, ay + 122), 7, outline=DANGER, width=1)
        d.text((cx0 + panel_w - 102, ay + 102), "Cancel", font=f(11, bold=True), fill=DANGER)

        ay += 156

    im.convert("RGB").save(OUT / "appointments.png", "PNG", optimize=True)


# ---- 5. MESSAGES ----
def render_messages():
    im, d = base_canvas()
    items = [("📊", "Dashboard"), ("📅", "Appointments"), ("✉", "Messages"),
             ("📋", "Prescriptions"), ("🧪", "Lab Results"), ("💳", "Billing"),
             ("👤", "Profile"), ("⚙", "Settings")]
    draw_sidebar(d, 2, items)
    draw_topbar(d, "Messages", "Secure, HIPAA-inspired threaded messaging")

    cx0 = SIDEBAR_W + 16
    cy0 = TOPBAR_H + 16

    # thread list
    tl_w = 380
    rounded_rect(d, (cx0, cy0, cx0 + tl_w, H - 16), 12, fill=WHITE)
    rounded_rect(d, (cx0, cy0, cx0 + tl_w, H - 16), 12, outline=GRAY_200, width=1)
    rounded_rect(d, (cx0 + 16, cy0 + 16, cx0 + tl_w - 16, cy0 + 48), 8, fill=GRAY_100)
    d.text((cx0 + 28, cy0 + 24), "🔍  Search messages...", font=f(12), fill=GRAY_500)

    threads = [
        ("Dr. Sarah Chen",    "Lab results are in",       "2m",  True,  True),
        ("Dr. Raj Patel",     "Refill approved",          "1h",  False, False),
        ("Billing Dept",      "Statement for April",      "3h",  False, False),
        ("Dr. Amy Williams",  "Re: Rash follow-up",       "1d",  False, False),
        ("Nurse Line",        "Appointment reminder",     "2d",  False, False),
        ("Dr. Sarah Chen",    "Welcome to HealthBridge",  "1w",  False, False),
    ]
    ty = cy0 + 72
    for name, snippet, when, unread, active in threads:
        if active:
            rounded_rect(d, (cx0 + 8, ty - 4, cx0 + tl_w - 8, ty + 64), 10, fill=PRIMARY_50)
        d.ellipse((cx0 + 20, ty, cx0 + 60, ty + 40), fill=PRIMARY_500)
        initials = "".join(p[0] for p in name.split()[:2] if p[0].isalpha()).upper()[:2]
        d.text((cx0 + 30, ty + 10), initials, font=f(13, bold=True), fill=WHITE)
        weight = True if unread else False
        d.text((cx0 + 72, ty + 2), name, font=f(13, bold=weight),
               fill=GRAY_900 if unread else GRAY_700)
        d.text((cx0 + 72, ty + 24), snippet, font=f(11, bold=unread),
               fill=GRAY_700 if unread else GRAY_500)
        d.text((cx0 + tl_w - 40, ty + 2), when, font=f(10), fill=GRAY_500)
        if unread:
            d.ellipse((cx0 + tl_w - 28, ty + 24, cx0 + tl_w - 16, ty + 36), fill=PRIMARY_600)
        ty += 72

    # conversation pane
    pc_x = cx0 + tl_w + 16
    pc_w = W - pc_x - 32
    rounded_rect(d, (pc_x, cy0, pc_x + pc_w, H - 16), 12, fill=WHITE)
    rounded_rect(d, (pc_x, cy0, pc_x + pc_w, H - 16), 12, outline=GRAY_200, width=1)

    # header
    d.ellipse((pc_x + 20, cy0 + 16, pc_x + 60, cy0 + 56), fill=PRIMARY_500)
    d.text((pc_x + 30, cy0 + 28), "SC", font=f(13, bold=True), fill=WHITE)
    d.text((pc_x + 72, cy0 + 18), "Dr. Sarah Chen", font=f(15, bold=True), fill=GRAY_900)
    d.text((pc_x + 72, cy0 + 40), "Cardiology · typically replies within 2h", font=f(11), fill=GRAY_500)
    rounded_rect(d, (pc_x + pc_w - 148, cy0 + 22, pc_x + pc_w - 24, cy0 + 50), 14, fill=SUCCESS_LIGHT)
    d.text((pc_x + pc_w - 130, cy0 + 28), "● Online now", font=f(11, bold=True), fill=SUCCESS)
    d.rectangle((pc_x + 16, cy0 + 74, pc_x + pc_w - 16, cy0 + 75), fill=GRAY_200)

    # messages
    def bubble(y, text, who, urgent=False):
        is_me = who == "me"
        bw = 360
        x = pc_x + pc_w - 24 - bw if is_me else pc_x + 24
        color = PRIMARY_600 if is_me else GRAY_100
        tcolor = WHITE if is_me else GRAY_900
        if urgent:
            color = DANGER_LIGHT
            tcolor = DANGER
        rounded_rect(d, (x, y, x + bw, y + 64), 12, fill=color)
        d.text((x + 16, y + 12), text[:48], font=f(12), fill=tcolor)
        if len(text) > 48:
            d.text((x + 16, y + 32), text[48:96], font=f(12), fill=tcolor)
        # timestamp
        tx = x + bw - 48 if is_me else x
        d.text((tx, y + 70), "10:24 AM", font=f(9), fill=GRAY_400)

    my = cy0 + 96
    bubble(my, "Hi Dr. Chen, my BP readings have been a", "me")
    my += 92
    bubble(my, "bit elevated this week. Should I adjust?", "me")
    my += 92
    bubble(my, "Good morning. Can you send me the last", "them")
    my += 92
    bubble(my, "7 days of readings? I'll review today.", "them")
    my += 92
    bubble(my, "[URGENT] Lab results are in — please call", "me", urgent=True)

    # composer
    cxy = H - 92
    rounded_rect(d, (pc_x + 16, cxy, pc_x + pc_w - 16, cxy + 56), 12, fill=GRAY_50)
    d.text((pc_x + 32, cxy + 18), "Write a secure message...", font=f(12), fill=GRAY_500)
    rounded_rect(d, (pc_x + pc_w - 108, cxy + 12, pc_x + pc_w - 28, cxy + 44), 8, fill=PRIMARY_600)
    d.text((pc_x + pc_w - 90, cxy + 20), "Send ➤", font=f(12, bold=True), fill=WHITE)

    im.convert("RGB").save(OUT / "messages.png", "PNG", optimize=True)


# ---- 6. PRESCRIPTIONS ----
def render_prescriptions():
    im, d = base_canvas()
    items = [("📊", "Dashboard"), ("📅", "Appointments"), ("✉", "Messages"),
             ("📋", "Prescriptions"), ("🧪", "Lab Results"), ("💳", "Billing"),
             ("👤", "Profile"), ("⚙", "Settings")]
    draw_sidebar(d, 3, items)
    draw_topbar(d, "Prescriptions", "Active · Refill requests · History")

    cx0 = SIDEBAR_W + 32
    cy0 = TOPBAR_H + 32

    # summary row
    stats = [("5", "Active", PRIMARY_600), ("2", "Ready for Refill", WARNING),
             ("1", "Pending Approval", ACCENT_600), ("18", "All-Time", GRAY_500)]
    sx = cx0
    for val, lbl, color in stats:
        rounded_rect(d, (sx, cy0, sx + 216, cy0 + 72), 10, fill=WHITE)
        rounded_rect(d, (sx, cy0, sx + 216, cy0 + 72), 10, outline=GRAY_200, width=1)
        rounded_rect(d, (sx, cy0, sx + 4, cy0 + 72), 0, fill=color)
        d.text((sx + 20, cy0 + 14), val, font=f(22, bold=True), fill=GRAY_900)
        d.text((sx + 20, cy0 + 48), lbl, font=f(11), fill=GRAY_600)
        sx += 232

    # prescriptions list
    py = cy0 + 96
    panel_w = W - cx0 - 32
    rounded_rect(d, (cx0, py, cx0 + panel_w, H - 32), 12, fill=WHITE)
    rounded_rect(d, (cx0, py, cx0 + panel_w, H - 32), 12, outline=GRAY_200, width=1)

    # table header
    hdr_y = py + 20
    cols = [("Medication", 24), ("Dose & Schedule", 260), ("Prescriber", 500),
            ("Refills Left", 680), ("Next Refill", 800), ("Status", 920)]
    d.rectangle((cx0 + 16, hdr_y + 28, cx0 + panel_w - 16, hdr_y + 29), fill=GRAY_200)
    for label, xoff in cols:
        d.text((cx0 + xoff, hdr_y), label, font=f(11, bold=True), fill=GRAY_500)

    rows = [
        ("Lisinopril 10 mg",   "1 tab PO daily",          "Dr. S. Chen",   "3",  "May 12", "Active",    SUCCESS, SUCCESS_LIGHT),
        ("Atorvastatin 20 mg", "1 tab PO QHS",            "Dr. S. Chen",   "2",  "May 05", "Active",    SUCCESS, SUCCESS_LIGHT),
        ("Metformin 500 mg",   "1 tab PO BID w/ meals",   "Dr. R. Patel",  "0",  "Apr 25", "Refill Due",WARNING, WARNING_LIGHT),
        ("Albuterol HFA",      "2 puffs PRN shortness",   "Dr. R. Patel",  "1",  "Jun 02", "Active",    SUCCESS, SUCCESS_LIGHT),
        ("Azithromycin 250",   "1 tab PO daily × 5d",     "Dr. A. Williams","—", "Complete","Completed", GRAY_500, GRAY_200),
        ("Vitamin D3 2000IU",  "1 tab PO daily",          "Dr. S. Chen",   "Pending refill", "—", "Pending", ACCENT_600, (204, 251, 241)),
    ]
    ry = hdr_y + 48
    for med, dose, pres, refills, next_refill, status, scolor, sbg in rows:
        d.text((cx0 + 24, ry), med, font=f(12, bold=True), fill=GRAY_900)
        d.text((cx0 + 24, ry + 18), "Rx #" + str(1000 + rows.index((med, dose, pres, refills, next_refill, status, scolor, sbg)) * 37),
               font=f(10), fill=GRAY_500)
        d.text((cx0 + 260, ry + 6), dose, font=f(11), fill=GRAY_700)
        d.text((cx0 + 500, ry + 6), pres, font=f(11), fill=GRAY_700)
        d.text((cx0 + 700, ry + 6), refills, font=f(11, bold=True), fill=GRAY_900)
        d.text((cx0 + 800, ry + 6), next_refill, font=f(11), fill=GRAY_700)
        rounded_rect(d, (cx0 + 910, ry, cx0 + 1030, ry + 24), 12, fill=sbg)
        d.text((cx0 + 924, ry + 4), status, font=f(11, bold=True), fill=scolor)
        # request refill button for refill-due
        if "Refill Due" in status:
            rounded_rect(d, (cx0 + 1044, ry, cx0 + 1144, ry + 24), 6, fill=PRIMARY_600)
            d.text((cx0 + 1058, ry + 5), "Refill →", font=f(11, bold=True), fill=WHITE)

        # row separator
        d.rectangle((cx0 + 16, ry + 44, cx0 + panel_w - 16, ry + 45), fill=GRAY_100)
        ry += 60

    im.convert("RGB").save(OUT / "prescriptions.png", "PNG", optimize=True)


def main():
    print("Rendering screenshots → docs/screenshots/")
    render_login()
    render_patient_dashboard()
    render_doctor_dashboard()
    render_appointments()
    render_messages()
    render_prescriptions()
    for p in sorted(OUT.glob("*.png")):
        print(f"  {p.name:28s} {p.stat().st_size//1024} KB")


if __name__ == "__main__":
    main()
