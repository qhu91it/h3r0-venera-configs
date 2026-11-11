class VinaHentai extends ComicSource {
    name = "VinaHentai"

    key = "vinahentai"

    version = "1.0.0"

    minAppVersion = "1.6.0"

    url = "https://raw.githubusercontent.com/qhu91it/h3r0-venera-configs/main/vinahentai.js"

    // ============================== Helpers ===============================

    static MANGA_PER_PAGE = 24

    get baseUrl() {
        let v = this.loadSetting('baseUrl')
        if (!v) v = "https://vinahentai.bio"
        return v.replace(/\/+$/, "")
    }

    absUrl(u) {
        if (!u) return ""
        if (u.startsWith("http://") || u.startsWith("https://")) return u
        if (u.startsWith("//")) return "https:" + u
        return this.baseUrl + (u.startsWith("/") ? "" : "/") + u
    }

    /** "/truyen-hentai/slug/..." -> "slug" */
    slugFromHref(href) {
        if (!href) return null
        let path = href.replace(/^https?:\/\/[^/]+/, "").split("?")[0]
        let parts = path.split("/").filter(s => s.length > 0)
        if (parts[0] !== "truyen-hentai" || !parts[1]) return null
        return parts[1]
    }

    async getDoc(url) {
        let res = await Network.get(url, {
            "Referer": this.baseUrl + "/",
        })
        if (res.status !== 200) {
            throw `Invalid status code: ${res.status}`
        }
        return new HtmlDocument(res.body)
    }

    /** Parse list pages (popular / latest / genres / danh-sach) */
    parseGrid(doc) {
        let comics = []
        let seen = {}
        for (let a of doc.querySelectorAll('.grid a[href*="/truyen-hentai/"]')) {
            let href = a.attributes["href"]
            let id = this.slugFromHref(href)
            if (!id || seen[id]) continue

            let title = null
            for (let d of a.querySelectorAll("div[title]")) {
                let t = d.attributes["title"]
                if (t && t.trim() !== "") {
                    title = t.trim()
                    break
                }
            }
            if (!title) continue

            let img = a.querySelector("img")
            seen[id] = true
            comics.push(new Comic({
                id: id,
                title: title,
                subTitle: "",
                cover: img ? this.absUrl(img.attributes["src"]) : "",
            }))
        }
        return comics
    }

    /** Parse search result page */
    parseSearch(doc) {
        let comics = []
        let seen = {}
        for (let a of doc.querySelectorAll('a.group[href^="/truyen-hentai/"]')) {
            let id = this.slugFromHref(a.attributes["href"])
            let h2 = a.querySelector("h2")
            if (!id || !h2 || seen[id]) continue
            let img = a.querySelector("img")
            seen[id] = true
            comics.push(new Comic({
                id: id,
                title: h2.text.trim(),
                subTitle: "",
                cover: img ? this.absUrl(img.attributes["src"]) : "",
            }))
        }
        return comics
    }

    async loadList(path, sort, status, page) {
        let url = `${this.baseUrl}${path}?page=${page}&sort=${sort}`
        if (status) url += `&status=${status}`
        let doc = await this.getDoc(url)
        let comics = this.parseGrid(doc)
        doc.dispose()
        // site has no reliable total page count: keep paging while a page is full
        let maxPage = comics.length >= VinaHentai.MANGA_PER_PAGE ? page + 1 : page
        return {comics: comics, maxPage: maxPage}
    }

    // =============================== Explore ==============================

    explore = [
        {
            title: "VinaHentai - Xem nhiều",
            type: "multiPageComicList",
            load: async (page) => {
                return await this.loadList("/danh-sach/", "views", "", page)
            },
        },
        {
            title: "VinaHentai - Mới cập nhật",
            type: "multiPageComicList",
            load: async (page) => {
                return await this.loadList("/danh-sach/", "updatedAt", "", page)
            },
        },
    ]

    // ============================== Category ==============================

    category = {
        title: "VinaHentai",
        parts: [
            {
                name: "Thể loại",
                type: "dynamic",
                loader: async () => {
                    let doc = await this.getDoc(`${this.baseUrl}/danh-sach`)
                    let seen = {}
                    let list = []
                    for (let a of doc.querySelectorAll('a[href*="/genres/"]')) {
                        let href = a.attributes["href"] || ""
                        let slug = href.split("/genres/")[1]
                        if (!slug) continue
                        slug = slug.split("?")[0].split("/")[0]
                        let name = a.text.trim()
                        if (!slug || !name || seen[slug]) continue
                        seen[slug] = true
                        list.push({
                            label: name,
                            target: {
                                page: "category",
                                attributes: {
                                    category: name,
                                    param: slug,
                                },
                            },
                        })
                    }
                    doc.dispose()
                    list.sort((x, y) => x.label.toLowerCase().localeCompare(y.label.toLowerCase()))
                    return list
                },
            },
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        /**
         * @param category {string}
         * @param param {string?} - genre slug
         * @param options {string[]} - [sort, status]
         * @param page {number}
         */
        load: async (category, param, options, page) => {
            let sort = options[0] || "updatedAt"
            let status = options[1] === "all" ? "" : (options[1] || "")
            let path = param ? `/genres/${param}` : "/danh-sach"
            return await this.loadList(path, sort, status, page)
        },
        optionList: [
            {
                label: "Sắp xếp theo",
                options: [
                    "updatedAt-Mới cập nhật",
                    "views-Xem nhiều",
                    "likes-Đánh giá cao",
                    "oldest-Cũ nhất",
                ],
            },
            {
                label: "Tình trạng",
                options: [
                    "all-Tất cả",
                    "ongoing-Đang tiến hành",
                    "completed-Đã hoàn thành",
                ],
            },
        ],
    }

    // ================================ Search ==============================

    search = {
        load: async (keyword, options, page) => {
            let url = `${this.baseUrl}/search?page=${page}&q=${encodeURIComponent(keyword)}`
            let doc = await this.getDoc(url)
            let comics = this.parseSearch(doc)

            let maxPage = 1
            let maxInput = doc.querySelector("input[type=number][max]")
            if (maxInput) {
                maxPage = parseInt(maxInput.attributes["max"]) || 1
            }
            if (page >= maxPage) {
                let hasNext = doc.querySelectorAll(`a[href*="page=${page + 1}"]`).length > 0
                if (hasNext) maxPage = page + 1
            }
            doc.dispose()

            return {comics: comics, maxPage: Math.max(maxPage, page)}
        },
        optionList: [],
    }

    // ================================ Comic ===============================

    comic = {
        loadInfo: async (id) => {
            let url = `${this.baseUrl}/truyen-hentai/${id}/`
            let doc = await this.getDoc(url)

            let titleEl = doc.querySelector("h1")
            let title = titleEl ? titleEl.text.trim() : id

            let authors = doc.querySelectorAll('a[href^="/authors/"]')
                .map(e => e.text.trim())
                .filter(t => t && !t.startsWith("+"))
            let genres = doc.querySelectorAll('a[href^="/genres/"]')
                .map(e => e.text.trim())
                .filter(t => t && !t.startsWith("+"))

            let coverEl = doc.querySelector('img[alt*="Bìa"]') || doc.querySelector('img[src*="story-images"]')
            let cover = coverEl ? this.absUrl(coverEl.attributes["src"]) : ""

            let descEl = doc.querySelector("#manga-description-section .text-txt-secondary")
            let description = descEl ? descEl.text.trim() : ""

            let bodyEl = doc.querySelector("body")
            let bodyText = bodyEl ? bodyEl.text : ""
            let status = "Không rõ"
            if (bodyText.includes("Đang tiến hành")) status = "Đang tiến hành"
            else if (bodyText.includes("Đã hoàn thành")) status = "Đã hoàn thành"

            // chapters: a.block[href^="/truyen-hentai/slug/chapter"]
            let chapters = {}
            let updateTime = undefined
            for (let a of doc.querySelectorAll('a.block[href^="/truyen-hentai/"]')) {
                let href = a.attributes["href"]
                let parts = href.split("?")[0].split("/").filter(s => s.length > 0)
                if (parts.length < 3) continue
                let path = "/" + parts.join("/")
                if (chapters[path] !== undefined) continue

                let span = a.querySelector("span")
                chapters[path] = (span ? span.text : a.text).trim()

                if (updateTime === undefined) {
                    let time = a.querySelector("time")
                    if (time) updateTime = time.text.trim()
                }
            }

            // site lists newest first; reverse so the order is oldest -> newest
            let ordered = {}
            for (let key of Object.keys(chapters).reverse()) {
                ordered[key] = chapters[key]
            }
            chapters = ordered

            let tags = {}
            if (authors.length) tags["Tác giả"] = authors
            if (genres.length) tags["Thể loại"] = genres
            tags["Tình trạng"] = [status]

            doc.dispose()

            return new ComicDetails({
                title: title,
                cover: cover,
                description: description,
                tags: tags,
                chapters: chapters,
                updateTime: updateTime,
                url: url,
            })
        },

        loadEp: async (comicId, epId) => {
            let res = await Network.get(this.baseUrl + epId, {
                "Referer": this.baseUrl + "/",
            })
            if (res.status !== 200) {
                throw `Invalid status code: ${res.status}`
            }

            // Don't anchor to an image subdomain (the site has rotated it before);
            // "/manga-images/" is the stable part.
            let regex = /https:\/\/[^"'\s\\]+\/manga-images\/[^"'\s\\]+/g
            let matches = res.body.match(regex) || []
            let images = [...new Set(matches)]

            if (images.length === 0) {
                throw "No images found"
            }
            return {images: images}
        },

        onImageLoad: (url, comicId, epId) => {
            return {
                headers: {
                    "Referer": this.baseUrl + "/",
                },
            }
        },

        onThumbnailLoad: (url) => {
            return {
                headers: {
                    "Referer": this.baseUrl + "/",
                },
            }
        },

        onClickTag: (namespace, tag) => {
            return {
                page: "search",
                attributes: {
                    keyword: tag,
                },
            }
        },

        idMatch: "vinahentai\\.[a-z]+/truyen-hentai/([^/?#]+)",

        link: {
            domains: [
                "vinahentai.bio",
            ],
            linkToId: (url) => {
                return this.slugFromHref(url)
            },
        },
    }

    // ================================ Settings ============================

    settings = {
        baseUrl: {
            title: "Base URL",
            type: "input",
            validator: "^https?://[^/\\s]+/?$",
            default: "https://vinahentai.bio",
        },
    }

    translation = {
        'en': {
            'Base URL': 'Base URL',
        },
        'vi': {
            'Base URL': 'Địa chỉ trang',
        },
    }
}
