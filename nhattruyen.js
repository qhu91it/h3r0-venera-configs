/** @type {import('./_venera_.js')} */

class NhatTruyen extends ComicSource {
    name = "NhatTruyen"

    key = "nhattruyen"

    version = "1.0.0"

    minAppVersion = "1.6.0"

    url = "https://raw.githubusercontent.com/qhu91it/h3r0-venera-configs/main/nhattruyen.js"

    defaultDomain = "https://nhattruyenqq.com"

    // slug cache: genre label -> genre slug (filled in loadInfo / category loader)
    _genreSlugs = {}

    // ============================== Helpers ======================================

    get baseUrl() {
        let d = (this.loadSetting('domain') || this.defaultDomain).trim().replace(/\/+$/, "")
        if (!/^https?:\/\//i.test(d)) d = "https://" + d
        return d
    }

    /** absolute url -> path (without domain) */
    relPath(href) {
        if (!href) return ""
        return href.replace(/^(https?:)?\/\/[^\/]+/i, "")
    }

    absUrl(u) {
        if (!u || u.trim() === "") return null
        u = u.trim()
        if (/^https?:\/\//i.test(u)) return u
        if (u.startsWith("//")) return "https:" + u
        if (u.startsWith("/")) return this.baseUrl + u
        return this.baseUrl + "/" + u
    }

    /** mirrors WPComics.imageOrNull, but also skips lazy-load placeholders */
    imageOf(el) {
        if (!el) return ""
        let attrs = el.attributes || {}
        for (let k of ["data-original", "data-src", "data-lazy-src", "data-cfsrc", "src"]) {
            let raw = attrs[k]
            if (!raw) continue
            raw = raw.trim()
            if (raw === "" || /^(data|blob|javascript):/i.test(raw)) continue
            if (/(loading|placeholder|blank|spinner)[^\/]*\.(gif|png|jpe?g|svg)/i.test(raw)) continue
            let v = this.absUrl(raw.replace(/ /g, "%20"))
            if (v) return v
        }
        // fallback: any attribute that looks like an image url (site may use a custom lazy-load attribute)
        for (let k in attrs) {
            let raw = (attrs[k] || "").toString().trim()
            if (/^(https?:)?\/\/\S+\.(jpe?g|png|webp|gif|avif)(\?\S*)?$/i.test(raw)) {
                return this.absUrl(raw)
            }
        }
        return ""
    }

    imageHeaders() {
        return {
            "Referer": `${this.baseUrl}/`,
        }
    }

    async fetchHtml(url, headers) {
        let res = await Network.get(url, headers || {})
        if (res.status !== 200) {
            throw `Invalid status code: ${res.status}`
        }
        return res.body
    }

    slugOf(id) {
        return id.split("/").filter(s => s.length > 0).pop()
    }

    parseComicList(html) {
        let doc = new HtmlDocument(html)
        let comics = doc.querySelectorAll("div.items div.item").map(el => {
            let a = el.querySelector("h3 a")
            if (!a) return null
            let href = a.attributes["href"]
            let sub = el.querySelector("figcaption ul li a")
            return new Comic({
                id: this.relPath(href),
                title: a.text.trim(),
                subTitle: sub ? sub.text.trim() : "",
                cover: this.imageOf(el.querySelector("div.image img")),
            })
        }).filter(c => c !== null)
        if (comics.length > 0) console.log(`first cover: ${comics[0].cover}`)
        let hasNext = doc.querySelector("a.next-page") != null || doc.querySelector("a[rel=next]") != null
        doc.dispose()
        return {comics: comics, hasNext: hasNext}
    }

    async loadList(url, page) {
        let html = await this.fetchHtml(url)
        let r = this.parseComicList(html)
        // site has no total page count; expose "one more page" while a next link exists
        return {comics: r.comics, maxPage: r.hasNext ? page + 1 : page}
    }

    buildQuery(params) {
        let parts = []
        for (let k in params) {
            let v = params[k]
            if (v === null || v === undefined || v === "") continue
            parts.push(`${k}=${encodeURIComponent(v)}`)
        }
        return parts.join("&")
    }

    // ============================== Explore ======================================

    explore = [
        {
            title: "NhatTruyen - Hot",
            type: "multiPageComicList",
            load: async (page) => {
                let url = `${this.baseUrl}/truyen-tranh-hot` + (page > 1 ? `?page=${page}` : "")
                return await this.loadList(url, page)
            },
        },
        {
            title: "NhatTruyen - Mới cập nhật",
            type: "multiPageComicList",
            load: async (page) => {
                let url = `${this.baseUrl}/` + (page > 1 ? `?page=${page}` : "")
                return await this.loadList(url, page)
            },
        },
    ]

    // ============================== Category (genres, fetched dynamically) =======

    category = {
        title: "NhatTruyen",
        parts: [
            {
                name: "Thể loại",
                type: "dynamic",
                loader: async () => {
                    let html = await this.fetchHtml(`${this.baseUrl}/tim-truyen`)
                    let doc = new HtmlDocument(html)
                    let items = doc.querySelectorAll(".genres ul.nav li:not(.active) a").map(a => {
                        let href = a.attributes["href"] || ""
                        let slug = href.replace(/\/+$/, "").split("/").pop()
                        let label = a.text.trim()
                        this._genreSlugs[label] = slug
                        return {
                            label: label,
                            target: {
                                page: "category",
                                attributes: {category: label, param: slug},
                            },
                        }
                    })
                    doc.dispose()
                    return items
                },
            }
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let status = options[0]
            let sort = options[1]
            let url = `${this.baseUrl}/tim-truyen` + (param ? `/${param}` : "")
            let q = this.buildQuery({
                status: status === "all" ? null : status,
                sort: sort,
                page: page,
            })
            return await this.loadList(`${url}?${q}`, page)
        },
        optionList: [
            {
                label: "Tình trạng",
                options: ["all-Tất cả", "1-Đang tiến hành", "2-Hoàn thành"],
            },
            {
                label: "Sắp xếp theo",
                options: [
                    "0-Ngày cập nhật",
                    "15-Truyện mới",
                    "10-Top all",
                    "11-Top tháng",
                    "12-Top tuần",
                    "13-Top ngày",
                    "20-Top theo dõi",
                    "25-Bình luận",
                    "30-Số chapter",
                ],
            },
        ],
    }

    // ============================== Search =======================================

    search = {
        load: async (keyword, options, page) => {
            let sort = options[0]
            let status = options[1]
            let q = this.buildQuery({
                status: status === "all" ? null : status,
                sort: sort,
                keyword: keyword,
                page: page,
            })
            return await this.loadList(`${this.baseUrl}/tim-truyen?${q}`, page)
        },
        optionList: [
            {
                type: "select",
                label: "Sắp xếp theo",
                options: [
                    "0-Ngày cập nhật",
                    "15-Truyện mới",
                    "10-Top all",
                    "11-Top tháng",
                    "12-Top tuần",
                    "13-Top ngày",
                    "20-Top theo dõi",
                    "25-Bình luận",
                    "30-Số chapter",
                ],
                default: "0",
            },
            {
                type: "select",
                label: "Tình trạng",
                options: ["all-Tất cả", "1-Đang tiến hành", "2-Hoàn thành"],
                default: "all",
            },
        ],
        enableTagsSuggestions: false,
    }

    // ============================== Comic ========================================

    comic = {
        loadInfo: async (id) => {
            let slug = this.slugOf(id)
            let html = await this.fetchHtml(this.baseUrl + id)
            let doc = new HtmlDocument(html)

            let text = (el, sel) => {
                let e = el.querySelector(sel)
                return e ? e.text.trim() : ""
            }

            let info = doc.querySelector("article#item-detail")
            let title = text(doc, "h1.title-detail")
            let author = "", status = "", cover = ""
            let genres = []
            let description = ""

            if (info) {
                author = text(info, "li.author p.col-xs-8")
                status = text(info, "li.status p.col-xs-8")
                cover = this.imageOf(info.querySelector("div.col-image img"))
                genres = info.querySelectorAll("li.kind p.col-xs-8 a").map(a => {
                    let label = a.text.trim()
                    let href = (a.attributes["href"] || "").replace(/\/+$/, "")
                    this._genreSlugs[label] = href.split("/").pop()
                    return label
                })

                let parts = []
                doc.querySelectorAll("div.detail-content div.shortened").forEach(s => {
                    s.children.forEach(c => parts.push(c.text.trim()))
                })
                if (parts.length === 0) {
                    doc.querySelectorAll("div.detail-content p").forEach(p => parts.push(p.text.trim()))
                }
                description = parts.join("\n\n")
                let other = text(info, "h2.other-name")
                if (other) description += `\n\nTên khác: ${other}`
            }

            // ---- chapters: JSON service first, HTML list as fallback
            let chapters = {}
            let updateTime = null
            try {
                let body = await this.fetchHtml(
                    `${this.baseUrl}/Comic/Services/ComicService.asmx/ChapterList?slug=${encodeURIComponent(slug)}`,
                    {
                        "X-Requested-With": "XMLHttpRequest",
                        "Accept": "application/json, text/javascript, */*; q=0.01",
                        "Referer": this.baseUrl + id,
                    }
                )
                let list = JSON.parse(body).data || []
                if (list.length > 0) updateTime = list[0].updated_at
                // site lists newest first; Venera expects oldest first
                for (let i = list.length - 1; i >= 0; i--) {
                    chapters[list[i].chapter_slug] = list[i].chapter_name
                }
            } catch (e) {
                console.warn(`ChapterList API failed: ${e}`)
            }

            if (Object.keys(chapters).length === 0) {
                let els = doc.querySelectorAll("div.list-chapter li.row:not(.heading)")
                for (let i = els.length - 1; i >= 0; i--) {
                    let a = els[i].querySelector("a")
                    if (!a) continue
                    let path = this.relPath(a.attributes["href"])
                    let idx = path.indexOf(slug + "/")
                    let epId = idx >= 0 ? path.substring(idx + slug.length + 1) : path
                    chapters[epId] = a.text.trim()
                }
            }

            doc.dispose()

            return new ComicDetails({
                title: title,
                subTitle: author,
                cover: cover,
                description: description,
                tags: {
                    "Tác giả": author ? [author] : [],
                    "Tình trạng": status ? [status] : [],
                    "Thể loại": genres,
                },
                chapters: chapters,
                updateTime: updateTime,
                url: this.baseUrl + id,
            })
        },

        loadEp: async (comicId, epId) => {
            let slug = this.slugOf(comicId)
            let html = await this.fetchHtml(`${this.baseUrl}/truyen-tranh/${slug}/${epId}`)
            let doc = new HtmlDocument(html)

            let els = doc.querySelectorAll("div.page-chapter > img")
            if (els.length === 0) {
                els = doc.querySelectorAll("li.blocks-gallery-item img")
            }

            let images = []
            for (let el of els) {
                let u = this.imageOf(el)
                if (u && !images.includes(u)) images.push(u)
            }
            doc.dispose()

            return {images: images}
        },

        onImageLoad: (url, comicId, epId) => {
            return {headers: this.imageHeaders()}
        },

        onThumbnailLoad: (url) => {
            return {headers: this.imageHeaders()}
        },

        onClickTag: (namespace, tag) => {
            if (namespace === "Thể loại" && this._genreSlugs[tag]) {
                return {
                    page: "category",
                    attributes: {category: tag, param: this._genreSlugs[tag]},
                }
            }
            return {
                page: "search",
                attributes: {keyword: tag},
            }
        },

        link: {
            domains: ["nhattruyenqq.com"],
            linkToId: (url) => {
                let m = url.match(/\/truyen-tranh\/([^\/?#]+)/)
                return m ? `/truyen-tranh/${m[1]}` : null
            },
        },
    }

    // ============================== Settings =====================================

    settings = {
        domain: {
            title: "Domain",
            type: "input",
            validator: null,
            default: "https://nhattruyenqq.com",
        },
    }
}
