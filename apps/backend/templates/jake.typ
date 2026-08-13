// Jake Gutierrez resume layout, ported from LaTeX to Typst.
// Original: https://github.com/jakegut/resume (MIT) / based on https://github.com/sb2nov/resume
//
// Renders the resume-ci context (sys.inputs.data). All section headings come from
// meta.section_titles, so the same template renders EN and PT-BR masters.
// No external Typst packages are imported on purpose: compilation stays offline.

#let data = json(bytes(sys.inputs.at("data", default: "{}")))
#let meta = data.at("meta", default: (:))
#let titles = meta.at("section_titles", default: (:))
#let labels = meta.at("labels", default: (:))

// ---------- rich text ----------

#let rich(parts) = {
  for part in parts {
    let value = part.at("text", default: "")
    let style = part.at("style", default: "")
    if style == "strong" { strong(value) } else if style == "emph" { emph(value) } else { value }
  }
}

#let has(parts) = type(parts) == array and parts.len() > 0

#let maybe-link(url, body) = if url == "" { body } else { link(url)[#body] }

// ---------- page setup ----------

#set page(
  paper: "us-letter",
  margin: (left: 0.5in, right: 0.5in, top: 0.5in, bottom: 0.5in),
)
#set text(
  font: meta.at("font", default: "New Computer Modern"),
  size: 11pt,
  fill: black,
  lang: meta.at("locale", default: "en").split("-").at(0),
)
#set par(leading: 0.58em, spacing: 0.6em, justify: false)
#show link: set text(fill: black)
#set list(indent: 0.15in, body-indent: 0.4em, marker: [•])
#show list: set par(leading: 0.5em)

// ---------- section heading (\scshape + \titlerule) ----------

#let section(name) = {
  v(6pt)
  block(below: 3pt)[#text(size: 13pt)[#smallcaps(name)]]
  line(length: 100%, stroke: 0.6pt)
  v(1pt)
}

// ---------- two-line subheading (\resumeSubheading) ----------

#let heading-row(left-body, right-body) = grid(
  columns: (1fr, auto),
  column-gutter: 0.5em,
  left-body,
  align(right)[#right-body],
)

#let bullets(items) = if has(items) {
  v(1pt)
  list(tight: true, spacing: 3pt, ..items.map(item => [#text(size: 10pt)[#rich(item)]]))
  v(2pt)
}

#let subheading(title-body, right-top, subtitle-body, right-bottom, items: ()) = {
  block(breakable: false, below: 0pt)[
    #heading-row(strong(title-body), strong(right-top))
    #if subtitle-body != none or right-bottom != none {
      v(1pt)
      heading-row(
        text(size: 10pt)[#emph(if subtitle-body == none [] else { subtitle-body })],
        text(size: 10pt)[#emph(if right-bottom == none [] else { right-bottom })],
      )
    }
  ]
  bullets(items)
  v(3pt)
}

// ---------- entry variants ----------

// Work / volunteer: position on top-left, company + location below (Jake's order).
#let work-entry(item) = {
  let url = item.at("url", default: "")
  let position = item.at("subtitle", default: ())
  let company = item.at("title", default: ())
  let location = item.at("location", default: ())
  let summary = item.at("summary", default: ())
  subheading(
    if has(position) { rich(position) } else { maybe-link(url, rich(company)) },
    item.at("period", default: ""),
    if has(position) { maybe-link(url, rich(company)) } else { none },
    if has(location) { rich(location) } else { none },
  )
  if has(summary) {
    text(size: 10pt)[#rich(summary)]
    v(2pt)
  }
  bullets(item.at("bullets", default: ()))
  v(3pt)
}

// Education: institution + location on top, degree + dates below.
#let education-entry(item) = {
  let url = item.at("url", default: "")
  let location = item.at("location", default: ())
  let score = item.at("score", default: ())
  let courses = item.at("courses", default: ())
  subheading(
    maybe-link(url, rich(item.at("title", default: ()))),
    if has(location) { rich(location) } else { "" },
    if has(item.at("subtitle", default: ())) { rich(item.subtitle) } else { none },
    item.at("period", default: ""),
  )
  // Score and coursework share one wrapped paragraph instead of a stacked bullet
  // list: coursework is scannable keyword material, not achievements, so it does
  // not earn one vertical line per item on a length-constrained resume.
  if has(score) or has(courses) {
    v(1pt)
    text(size: 10pt)[
      #if has(score) [#emph(labels.at("score", default: "Score") + ": ")#rich(score)]
      #if has(score) and has(courses) [ #sym.dot.c ]
      #if has(courses) [
        #emph(labels.at("courses", default: "Relevant coursework") + ": ")
        #courses.map(course => rich(course)).join(", ")
      ]
    ]
    v(2pt)
  }
}

// Projects: **Name** | *Stack*  ...  dates
#let project-entry(item) = {
  let url = item.at("url", default: "")
  let keywords = item.at("keywords", default: ())
  let summary = item.at("summary", default: ())
  block(breakable: false, below: 0pt)[
    #heading-row(
      text(size: 10pt)[
        #strong(maybe-link(url, rich(item.at("title", default: ()))))
        #if has(keywords) [ #h(0.35em)|#h(0.35em) #emph(rich(keywords))]
      ],
      text(size: 10pt)[#strong(item.at("period", default: ""))],
    )
  ]
  if has(summary) {
    v(1pt)
    text(size: 10pt)[#rich(summary)]
  }
  bullets(item.at("bullets", default: ()))
  v(3pt)
}

// Certificates / awards / publications: title + date, issuer below.
#let simple-entry(item) = {
  let url = item.at("url", default: "")
  let summary = item.at("summary", default: ())
  subheading(
    maybe-link(url, rich(item.at("title", default: ()))),
    item.at("period", default: ""),
    if has(item.at("subtitle", default: ())) { rich(item.subtitle) } else { none },
    none,
  )
  if has(summary) {
    text(size: 10pt)[#rich(summary)]
    v(3pt)
  }
}

// Skills / languages / interests: **Category**: a, b, c
#let tag-entry(item) = {
  let label = item.at("label", default: ())
  let level = item.at("level", default: ())
  let items = item.at("items", default: ())
  text(size: 10pt)[
    #if has(label) [#strong(rich(label))]
    #if has(level) [ (#emph(rich(level)))]
    #if has(items) [: #rich(items)]
  ]
  linebreak()
}

#let reference-entry(item) = {
  let name = item.at("name", default: ())
  let reference = item.at("reference", default: ())
  if has(name) { text(size: 10pt)[#strong(rich(name))]; v(1pt) }
  if has(reference) { text(size: 10pt)[#rich(reference)] }
  v(4pt)
}

// ---------- header ----------

#let personal = data.at("personal", default: (:))

#align(center)[
  #text(size: 24pt)[#smallcaps(strong(rich(personal.at("name", default: ()))))]
  #if has(personal.at("title", default: ())) [
    \ #v(2pt)
    #text(size: 11pt)[#rich(personal.title)]
  ]
  \ #v(2pt)
  #text(size: 10pt)[
    #{
      let items = data.at("contact", default: ())
      let first = true
      for item in items {
        if not first [ #h(0.35em)|#h(0.35em) ]
        first = false
        let href = item.at("href", default: "")
        let label = item.at("text", default: "")
        if href == "" { label } else { link(href)[#underline(offset: 2pt)[#label]] }
      }
    }
  ]
]

#v(4pt)

// ---------- body ----------

#let render(key, fallback, entries, renderer) = {
  if entries.len() > 0 {
    section(titles.at(key, default: fallback))
    for item in entries { renderer(item) }
  }
}

#if has(data.at("summary", default: ())) [
  #section(titles.at("summary", default: "Professional Summary"))
  #text(size: 10pt)[#rich(data.summary)]
  #v(3pt)
]

#render("work", "Experience", data.at("work", default: ()), work-entry)
#render("education", "Education", data.at("education", default: ()), education-entry)
#render("projects", "Projects", data.at("projects", default: ()), project-entry)
#render("skills", "Technical Skills", data.at("skills", default: ()), tag-entry)
#render("certificates", "Certifications", data.at("certificates", default: ()), simple-entry)
#render("awards", "Awards", data.at("awards", default: ()), simple-entry)
#render("publications", "Publications", data.at("publications", default: ()), simple-entry)
#render("volunteer", "Volunteer", data.at("volunteer", default: ()), work-entry)
#render("languages", "Languages", data.at("languages", default: ()), tag-entry)
#render("interests", "Interests", data.at("interests", default: ()), tag-entry)
#render("references", "References", data.at("references", default: ()), reference-entry)
