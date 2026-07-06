 #Loop Figma Export

 {
  "project": "Loop",
  "version": "1.1.0",
  "stack": {
    "framework": "React 18",
    "styling": "Tailwind CSS v4",
    "fonts": ["Space Grotesk", "Inter"],
    "icons": "lucide-react",
    "state": "useState (local, no external store)"
  },
  "designTokens": {
    "colors": {
      "ink": "#0B0B0F",
      "white": "#FFFFFF",
      "surface": "#F7F7F8",
      "primary": "#6D5EFC",
      "primaryLight": "#F0EFFE",
      "accent": "#FF2E74",
      "success": "#16C784",
      "networking": "#2D8CFF",
      "food": "#FFB020",
      "campus": "#FF7A45",
      "textPrimary": "#0B0B0F",
      "textSecondary": "#6B6B76",
      "textMuted": "#A0A0AB",
      "placeholder": "#9A9AA5",
      "borderLight": "#E4E4E7",
      "cardBg": "#FFFFFF",
      "darkSurface": "#0B0B0F",
      "darkCard": "#1F1F27"
    },
    "categoryColors": {
      "Music": "#6D5EFC",
      "Nightlife": "#FF2E74",
      "Sports": "#16C784",
      "Networking": "#2D8CFF",
      "Food": "#FFB020",
      "Campus": "#FF7A45"
    },
    "typography": {
      "display": { "family": "Space Grotesk", "weights": [500, 600, 700], "usage": "hero headlines, card titles, screen headings" },
      "body": { "family": "Inter", "weights": [400, 500, 600, 700], "usage": "UI labels, body copy, inputs, buttons" },
      "heroSize": "88–96px desktop / 48–56px mobile",
      "inputLabel": "13px Inter 500",
      "cardTitle": "16px Space Grotesk 700"
    },
    "spacing": [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80],
    "radii": {
      "card": "20px",
      "button": "12px",
      "pill": "9999px",
      "input": "12px",
      "avatar": "9999px"
    },
    "shadows": {
      "card": "0 4px 24px rgba(11,11,15,0.06)",
      "cardHover": "0 8px 40px rgba(11,11,15,0.12)",
      "hero": "0 8px 40px rgba(11,11,15,0.12)"
    },
    "breakpoints": { "mobile": 390, "tablet": 768, "desktop": 1440 }
  },
  "designSystem": {
    "inputSpec": {
      "bg": "#FFFFFF",
      "border": "1px solid #E4E4E7",
      "borderRadius": "12px",
      "padding": "12px 16px",
      "fontSize": "14px",
      "placeholder": "#9A9AA5",
      "focusBorder": "#6D5EFC",
      "focusRing": "2px rgba(109,94,252,0.15)",
      "label": "13px Inter 500 #6B6B76 above field"
    },
    "selectedState": {
      "rule": "ONE standard across the entire app: filled #6D5EFC pill + white text",
      "applies": ["CategoryChipRow", "FeedTabs", "FilterPillBar", "RoleSelector"],
      "unselected": "white bg, #E4E4E7 border, #6B6B76 text"
    },
    "cardTitles": "always #111, no hover color changes",
    "aiChip": "max-w-[168px] with text truncation, fixed gap from AlmostFullBadge"
  },
  "components": [
    {
      "name": "FormField",
      "description": "Label + input wrapper. Label is 13px Inter 500 #6B6B76 above child",
      "props": ["label: string", "children: ReactNode"],
      "variants": [],
      "states": []
    },
    {
      "name": "PasswordField",
      "description": "Text input with show/hide eye toggle (Eye/EyeOff icons)",
      "props": ["placeholder?: string"],
      "variants": ["show-text", "show-password"],
      "states": ["default", "focused", "filled"]
    },
    {
      "name": "EventCard",
      "description": "Primary event card. Poster image + overlay badges + info section + actions",
      "props": ["event: Event", "onClick?: fn", "showRationale?: boolean"],
      "variants": ["standard (no rationale)", "ForYou (with AI chip)"],
      "states": ["default", "hover (scale image)", "saved"],
      "anatomy": ["poster 192px", "gradient overlay", "AIChip|CategoryBadge top-left", "AlmostFullBadge top-right", "price bottom-left", "title #111 Space Grotesk", "organizer row", "date+venue row", "GoingStack + SaveBtn + RSVPBtn"]
    },
    {
      "name": "AIChip",
      "description": "Violet pill with Sparkles icon + truncated rationale text. max-w-168px",
      "props": ["text: string"],
      "variants": [],
      "states": []
    },
    {
      "name": "AlmostFullBadge",
      "description": "Hot-pink pill badge, flex-shrink-0, whitespace-nowrap",
      "props": [],
      "variants": [],
      "states": []
    },
    {
      "name": "GoingStack",
      "description": "3 overlapping avatar images + '+N going' count",
      "props": ["count: number", "size?: 'sm'|'md'"],
      "variants": ["sm (24px avatars)", "md (32px avatars)"],
      "states": []
    },
    {
      "name": "RSVPBtn",
      "description": "Hot-pink CTA button",
      "props": ["variant?: 'filled'|'outline'", "sm?: boolean"],
      "variants": ["filled (default)", "outline"],
      "states": ["default", "hover", "active:scale-95"]
    },
    {
      "name": "SaveBtn",
      "description": "Bookmark toggle. Filled violet when saved",
      "props": ["saved: boolean", "onToggle: fn"],
      "variants": [],
      "states": ["unsaved", "saved (fill-violet)"]
    },
    {
      "name": "FollowBtn",
      "description": "Primary violet fill when not following, bordered gray when following",
      "props": ["following?: boolean"],
      "variants": ["follow (violet)", "following (outlined gray)"],
      "states": []
    },
    {
      "name": "VerifiedBadge",
      "description": "16px violet circle with white checkmark",
      "props": [],
      "variants": [],
      "states": []
    },
    {
      "name": "RoleBadge",
      "description": "Pill with role-specific tinted bg and text",
      "props": ["role: 'Attendee'|'Organizer'|'Promoter'|'Sports Host'"],
      "variants": ["Attendee (gray)", "Organizer (violet)", "Promoter (pink)", "Sports Host (green)"],
      "states": []
    },
    {
      "name": "TopNav",
      "description": "Sticky white/95 backdrop nav. Logo left, links center (desktop), auth/profile right",
      "props": ["onNav: fn", "isLoggedIn: boolean", "current: Screen"],
      "variants": ["logged-out (Login+Signup)", "logged-in (Bell+Avatar)"],
      "states": ["active link (violet)"]
    },
    {
      "name": "BottomBar",
      "description": "Mobile-only fixed bottom tab bar. Create tab has elevated pink button",
      "props": ["onNav: fn", "current: Screen"],
      "variants": [],
      "states": ["active (violet icon+label)"]
    },
    {
      "name": "CatRow",
      "description": "Horizontal scrollable category chip row. Selected = filled #6D5EFC",
      "props": ["active: string", "onChange: fn"],
      "variants": [],
      "states": ["selected (violet fill white text)", "unselected (white + #E4E4E7 border)"]
    },
    {
      "name": "FilterBar",
      "description": "Horizontal scrollable filter pills. Selected = filled #6D5EFC",
      "props": [],
      "variants": [],
      "states": ["selected (violet)", "unselected (white border)"]
    },
    {
      "name": "StoriesRow",
      "description": "Horizontal avatar ring row. Labels allow 2 lines, w-16, no truncation",
      "props": [],
      "variants": [],
      "states": []
    },
    {
      "name": "PostCard",
      "description": "Instagram-style post card. Header + full image + action row + comments",
      "props": ["event: Event"],
      "variants": [],
      "states": ["liked (pink heart fill)", "saved (violet bookmark fill)"]
    },
    {
      "name": "AIAssistant",
      "description": "Floating violet trigger button + right-side slide-in drawer (w-320). Drawer has header, chat messages, event card results, input. Backdrop closes drawer. Does NOT cover main content.",
      "props": [],
      "variants": ["closed (button only)", "open (full drawer + backdrop)"],
      "states": ["idle", "thinking (bounce dots)", "results (event cards inline)"],
      "anatomy": ["fixed trigger bottom-right", "fixed right-side drawer translate-x", "backdrop overlay z-40", "drawer z-50", "gradient header", "scrollable messages", "input+send footer"]
    }
  ],
  "screens": [
    {
      "name": "Landing",
      "route": "/",
      "roles": ["anonymous"],
      "layout": {
        "desktop": "Full-bleed dark hero with nav, tightened vertical spacing, mini search bar + 3 event preview cards below CTAs, horizontal event carousel, gradient fade to white, white value-props section, single CTA. NO trust row (stats removed).",
        "mobile": "Same flow, stacked single column"
      },
      "componentsUsed": ["EventCard (mini preview)", "carousel cards"],
      "data": ["EVENTS (8 items for carousel)"],
      "notes": "HAPPENING NEAR YOU label uses text-white/55 for readable contrast on dark. Gradient div h-20 bg-gradient-to-b from-[#0B0B0F] to-white creates intentional seam."
    },
    {
      "name": "Auth",
      "route": "/auth",
      "roles": ["anonymous"],
      "layout": {
        "desktop": "Centered card max-w-md on off-white. Mode toggle (Sign up / Log in). Social auth buttons. Labeled form fields with FormField wrapper. PasswordField with show/hide eye. Role selector grid (signup only). Hot-pink CTA.",
        "mobile": "Same, full width"
      },
      "componentsUsed": ["FormField", "PasswordField"],
      "data": [],
      "notes": "All inputs: white bg, 1px #E4E4E7 border, 12px radius, 13px Inter label above, placeholder #9A9AA5, focus ring #6D5EFC/15"
    },
    {
      "name": "Onboarding",
      "route": "/onboarding",
      "roles": ["new-user"],
      "layout": {
        "desktop": "Two steps: interest chips + city. Step 1: live count badge, 'Pick at least 3' helper. Chips flush below subhead, CTA pushed to bottom with mt-auto. Continue disabled (gray) until 3 selected. Step 2: city search + location button + city options.",
        "mobile": "Same single column"
      },
      "componentsUsed": ["ChipGrid"],
      "data": ["INTERESTS (24 items)"],
      "aiFeature": "none"
    },
    {
      "name": "ForYouFeed",
      "route": "/feed",
      "roles": ["attendee", "organizer", "promoter", "sportsHost"],
      "layout": {
        "desktop": "Sticky search bar (NL placeholder, mic+location icons). Tabs (violet selected). CatRow. Featured hero card 320px tall. Grid: flex-wrap justify-center xl:justify-start with calc widths for 4-col centering of short last rows.",
        "mobile": "Single column. BottomBar. Featured card full-width."
      },
      "componentsUsed": ["TopNav", "BottomBar", "CatRow", "EventCard (showRationale)", "GoingStack", "AIChip", "RSVPBtn", "SaveBtn"],
      "data": ["EVENTS"],
      "aiFeature": "AI rationale chip on every ForYouCard: 'Because you [behavior]'"
    },
    {
      "name": "Discover",
      "route": "/discover",
      "roles": ["all"],
      "layout": {
        "desktop": "Search bar with location pill. CatRow. FilterBar (violet selected). Event count header. Same 4-col flex-wrap centered grid.",
        "mobile": "Single column grid"
      },
      "componentsUsed": ["CatRow", "FilterBar", "EventCard"],
      "data": ["EVENTS (filterable by category)"],
      "aiFeature": "naturalLanguageSearch"
    },
    {
      "name": "EventDetail",
      "route": "/event/:id",
      "roles": ["all"],
      "layout": {
        "desktop": "Dark immersive header: blurred bg image, 2-col (poster | info). Info: category tag, title, organizer+follow, meta rows, GoingStack card, RSVP+Save CTAs. Light body: About + Comments (2-col) | Sidebar (map + more events).",
        "mobile": "Stack: dark header full-width, then light content"
      },
      "componentsUsed": ["GoingStack", "VerifiedBadge", "FollowBtn", "RSVPBtn", "SaveBtn"],
      "data": ["event: Event", "comments: Comment[]"],
      "aiFeature": "none"
    },
    {
      "name": "SocialFeed",
      "route": "/social",
      "roles": ["attendee", "organizer", "promoter", "sportsHost"],
      "layout": {
        "desktop": "3-column: Left rail w-56 (upcoming RSVPs + suggested follows) | Center flex-1 max-w-lg (StoriesRow + PostCards) | Right rail w-60 xl-only (trending events + weekend promo card).",
        "mobile": "Single center column, no rails"
      },
      "componentsUsed": ["StoriesRow", "PostCard", "FollowBtn", "VerifiedBadge", "RoleBadge"],
      "data": ["EVENTS for posts", "AVATARS for stories"],
      "aiFeature": "none"
    },
    {
      "name": "CreateEvent",
      "route": "/create",
      "roles": ["organizer", "promoter", "sportsHost"],
      "layout": {
        "desktop": "2-col form | live preview. Form: flyer upload, FormField inputs (title, date w/Calendar icon, time, location w/MapPin icon, price/capacity/age). Description + AI Write button. AI tags panel. Sports toggle + reveal fields. Publish CTA.",
        "mobile": "Single column form, preview hidden"
      },
      "componentsUsed": ["FormField", "EventCard (live preview)"],
      "data": ["EVENTS[0] as preview base"],
      "aiFeature": "aiDescription (Write with AI → fills textarea after 1.4s), autoCategorization (AI tags panel)"
    },
    {
      "name": "SportsPickupDetail",
      "route": "/sports/:id",
      "roles": ["all"],
      "layout": {
        "desktop": "Dark header: 2-col (info + counter card). Counter card: filled/total, progress bar, position picker grid, join CTA. Light body: roster table with skill badges + open slots.",
        "mobile": "Stack: dark header, counter card, roster"
      },
      "componentsUsed": ["SportsCounter (inline)", "SkillBadge (inline)"],
      "data": ["ev: EVENTS[2] (soccer)", "players: PlayerRow[]"],
      "notes": "Price rendered as {ev.price} entry (NOT $${ev.price}). 'Ask Loop' drawer does not cover roster."
    },
    {
      "name": "OrganizerProfile",
      "route": "/organizer/:id",
      "roles": ["all"],
      "layout": {
        "desktop": "Cover image h-52/64 with back button. Avatar overlapping cover (-mt-8). Name+verified+role badge, follower/event counts, Follow btn. Bio text. Upcoming/Past tabs. Event grid.",
        "mobile": "Same stacked"
      },
      "componentsUsed": ["VerifiedBadge", "RoleBadge", "FollowBtn", "EventCard"],
      "data": ["EVENTS (all 8)"]
    },
    {
      "name": "UserProfile",
      "route": "/profile",
      "roles": ["attendee", "organizer", "promoter", "sportsHost"],
      "layout": {
        "desktop": "Cover banner h-36/48 (photo + violet-to-pink gradient overlay). Avatar overlapping cover (-mt-8) with ring-4 ring-white + green online dot. Name, role badge, handle, following/followers. Edit profile btn. Tabs: Saved/Going/Interests. Interests tab = chip grid. Others = event grid.",
        "mobile": "Same stacked"
      },
      "componentsUsed": ["RoleBadge", "EventCard"],
      "data": ["EVENTS (8 for grids)", "INTERESTS subset for chips"]
    },
    {
      "name": "AIAssistantDrawer",
      "route": "overlay",
      "roles": ["authenticated"],
      "layout": {
        "desktop": "Right-side fixed drawer w-320 slides in from right (translate-x-0 / translate-x-full). Semi-transparent backdrop z-40 closes drawer. Violet gradient header with X button. Scrollable chat messages. Event card results inline. Input footer.",
        "mobile": "Same drawer, covers right portion"
      },
      "componentsUsed": ["AIAssistant"],
      "data": ["EVENTS.slice(0,3) for results"],
      "aiFeature": "conversationalEventPlanning"
    }
  ],
  "userRoles": [
    {
      "id": "attendee",
      "permissions": ["browse events", "RSVP", "save events", "follow organizers", "comment", "view social feed", "set interests"]
    },
    {
      "id": "organizer",
      "permissions": ["all attendee permissions", "create events", "publish events", "AI description generation", "AI auto-tagging", "view organizer profile"]
    },
    {
      "id": "promoter",
      "permissions": ["all organizer permissions", "create promoter-specific events"]
    },
    {
      "id": "sportsHost",
      "permissions": ["all attendee permissions", "create sports pickup runs", "manage roster", "set positions and skill levels"]
    }
  ],
  "aiFeatures": [
    {
      "name": "forYouRecommendations",
      "surface": "ForYouFeed",
      "trigger": "on feed load / tab switch",
      "output": "AIChip on each EventCard: 'Because you [saved|liked|follow] X'",
      "maxChipWidth": "168px with text-overflow:ellipsis",
      "notes": "Chip must never overlap AlmostFullBadge — use flex row with gap-2 and flex-shrink-0 on badge"
    },
    {
      "name": "naturalLanguageSearch",
      "surface": "ForYouFeed (search bar), Discover",
      "trigger": "user types in search input",
      "placeholder": "Try 'free Afrobeats party this weekend'",
      "notes": "Mic button for voice input (UI only in this build)"
    },
    {
      "name": "autoCategorization",
      "surface": "CreateEvent",
      "trigger": "after AI description generation completes",
      "output": "Tag pills: #Afrobeats #21+ #Nightlife #Oakland #RooftopParty — each removable with × button"
    },
    {
      "name": "aiDescription",
      "surface": "CreateEvent",
      "trigger": "'✨ Write with AI' button click",
      "output": "Fills textarea with generated description after 1.4s simulated delay",
      "notes": "Button shows 'Writing...' state during generation"
    },
    {
      "name": "conversationalPlanning",
      "surface": "AIAssistantDrawer (global)",
      "trigger": "floating violet Sparkles button (fixed bottom-right)",
      "output": "Chat messages + 3 EventCard mini-previews inline after any query",
      "uxPattern": "Right-side slide-in drawer, does not obstruct page content"
    }
  ],
  "gridSystem": {
    "pattern": "flex flex-wrap gap-4",
    "centering": "justify-center xl:justify-start",
    "cardWidths": {
      "mobile": "w-full",
      "sm": "w-[calc(50%-8px)]",
      "lg": "w-[calc(33.333%-11px)]",
      "xl": "w-[calc(25%-12px)]"
    },
    "notes": "Wraps each EventCard in a width-controlled div for centering last short row"
  },
  "cssConventions": {
    "scrollbarHide": ".scrollbar-hide { scrollbar-width:none; -ms-overflow-style:none } .scrollbar-hide::-webkit-scrollbar { display:none }",
    "darkHeroPattern": "bg-[#0B0B0F] with absolute blurred bg image opacity-20 blur-md scale-110",
    "gradientSeam": "div h-20 bg-gradient-to-b from-[#0B0B0F] to-white",
    "cardShadow": "shadow-[0_4px_24px_rgba(11,11,15,0.06)]"
  }
}