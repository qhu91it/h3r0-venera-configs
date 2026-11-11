/** @type {import('./_venera_.js')} */

class DocTruyen3Q extends ComicSource {
    name = "DocTruyen3Q"

    key = "doctruyen3q"

    version = "1.0.0"

    minAppVersion = "1.6.0"

    url = "https://raw.githubusercontent.com/qhu91it/h3r0-venera-configs/main/doctruyen3q.js"

    // ---------- helpers ----------

    get baseUrl() {
        let d = this.loadSetting('domain') || 'https://doctruyen3qhub.fit'
        d = d.trim()
        if (!d.startsWith('http')) d = 'https://' + d
        return d.replace(/\/+$/, '')
    }

    abs(url) {
        if (!url) return ''
        url = url.trim()
        if (url.startsWith('http')) return url
        if (url.startsWith('//')) return 'https:' + url
        return this.baseUrl + (url.startsWith('/') ? '' : '/') + url
    }

    /** strip domain, keep path (+query) */
    toPath(url) {
        return this.abs(url).replace(/^https?:\/\/[^\/]+/, '')
    }

    imageOf(el) {
        if (!el) return ''
        let a = el.attributes
        for (let k of ['data-original', 'data-src', 'src']) {
            if (a[k] && a[k].trim() !== '') {
                let u = this.abs(a[k])
                if (/^https?:\/\//i.test(u)) return u
            }
        }
        return ''
    }

    /** port of WPComics.toDate; returns YYYY-MM-DD (Vietnam time) or undefined */
    toDate(text) {
        if (!text) return undefined
        text = text.trim()
        let pad = (n) => String(n).padStart(2, '0')
        let fmt = (d) => {
            let v = new Date(d.getTime() + 7 * 3600 * 1000) // UTC+7
            return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`
        }
        let lower = text.toLowerCase()
        if (['ago', 'trước', '前'].some(w => lower.includes(w))) {
            let m = text.match(/(\d+)/)
            if (!m) return undefined
            let n = parseInt(m[1])
            let now = new Date()
            let ms = {
                'giây': 1000, 'second': 1000,
                'phút': 60000, 'minute': 60000,
                'giờ': 3600000, 'hour': 3600000,
                'ngày': 86400000, 'day': 86400000,
                'tuần': 7 * 86400000, 'week': 7 * 86400000,
                'tháng': 30 * 86400000, 'month': 30 * 86400000,
                'năm': 365 * 86400000, 'year': 365 * 86400000,
            }
            // check larger units first, same order as the Kotlin code
            for (let k of ['năm', 'year', 'tháng', 'month', 'ngày', 'day', 'tuần', 'week', 'giờ', 'hour', 'phút', 'minute', 'giây', 'second']) {
                if (lower.includes(k)) return fmt(new Date(now.getTime() - n * ms[k]))
            }
            return fmt(now)
        }
        let last = text.split(' ').pop()
        let m = last.match(/^(\d{1,2})[-\/.](\d{1,2})(?:[-\/.](\d{2,4}))?$/)
        if (!m) return undefined
        let year = m[3] ? parseInt(m[3]) : new Date().getFullYear()
        if (year < 100) year += 2000
        return `${year}-${pad(parseInt(m[2]))}-${pad(parseInt(m[1]))}`
    }

    async getHtml(url) {
        let res = await Network.get(url, {
            'Referer': this.baseUrl + '/',
        })
        if (res.status !== 200) {
            throw `Invalid status code: ${res.status}`
        }
        return new HtmlDocument(res.body)
    }

    /** parse list pages (popular/latest/search/category) */
    parseList(doc, page) {
        let comics = doc.querySelectorAll('div.item-manga div.item').map(item => {
            let a = item.querySelector('h3 a')
            if (!a) return null
            return new Comic({
                id: this.toPath(a.attributes['href']),
                title: a.text.trim(),
                subTitle: '',
                cover: this.imageOf(item.querySelector('img')),
                tags: [],
                description: '',
            })
        }).filter(e => e !== null)

        let hasNext = doc.querySelector('a.next-page, a[rel=next]') !== null
        return {
            comics: comics,
            maxPage: hasNext ? page + 1 : page,
        }
    }

    async loadList(url, page) {
        let doc = await this.getHtml(url)
        let result = this.parseList(doc, page)
        doc.dispose()
        return result
    }

    // ---------- explore ----------

    explore = [
        {
            title: "DocTruyen3Q - Mới cập nhật",
            type: "multiPageComicList",
            load: async (page) => {
                return await this.loadList(this.baseUrl + (page > 1 ? `?page=${page}` : ''), page)
            },
        },
        {
            title: "DocTruyen3Q - Phổ biến",
            type: "multiPageComicList",
            load: async (page) => {
                return await this.loadList(`${this.baseUrl}/hot` + (page > 1 ? `?page=${page}` : ''), page)
            },
        },
    ]

    // ---------- category ----------

    category = {
        title: "DocTruyen3Q",
        parts: [
            {
                name: "Thể loại",
                type: "dynamic",
                // Genres are scraped from the site (same as `genresSelector` in the Kotlin source)
                loader: async () => {
                    let doc = await this.getHtml(`${this.baseUrl}/tim-truyen`)
                    let list = doc.querySelectorAll('.categories-detail ul.nav li:not(.active) a').map(a => {
                        let href = a.attributes['href'] || ''
                        let slug = href.split('?')[0].replace(/\/+$/, '').split('/').pop()
                        return {
                            label: a.text.trim(),
                            target: {
                                page: "category",
                                attributes: {
                                    category: a.text.trim(),
                                    param: slug,
                                },
                            },
                        }
                    }).filter(e => e.target.attributes.param)
                    doc.dispose()
                    return list
                },
            }
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let status = options[0] ?? '-1'
            let url = `${this.baseUrl}/tim-truyen`
            if (param) url += `/${param}`
            url += `?status=${status}&page=${page}`
            return await this.loadList(url, page)
        },
        optionList: [
            {
                label: "Trạng thái",
                options: [
                    "-1-Tất cả",
                    "1-Đang tiến hành",
                    "2-Hoàn thành",
                ],
            }
        ],
    }

    // ---------- search ----------

    search = {
        load: async (keyword, options, page) => {
            let status = options[0] ?? '-1'
            let url = `${this.baseUrl}/tim-truyen?`
            let params = []
            if (status !== '-1') params.push(`status=${status}`)
            if (keyword && keyword.trim() !== '') {
                params.push(`keyword=${encodeURIComponent(keyword.trim())}`)
                if (page > 1) params.push(`page=${page}`)
            } else {
                params.push(`page=${page}`)
            }
            return await this.loadList(url + params.join('&'), page)
        },
        optionList: [
            {
                type: "select",
                label: "Trạng thái",
                options: [
                    "-1-Tất cả",
                    "1-Đang tiến hành",
                    "2-Hoàn thành",
                ],
                default: "-1",
            }
        ],
        enableTagsSuggestions: false,
    }

    // ---------- comic ----------

    comic = {
        loadInfo: async (id) => {
            let doc = await this.getHtml(this.abs(id))

            let title = doc.querySelector('h1.title-manga')?.text.trim() ?? ''
            let author = doc.querySelector('li.author p.col-sm-8')?.text.trim() ?? ''
            let description = doc.querySelectorAll('p.detail-summary')
                .map(e => e.text.trim())
                .join('\n')
            let status = doc.querySelector('li.status p.detail-info span')?.text.trim() ?? ''
            let genres = doc.querySelectorAll('li.category p.detail-info a').map(e => e.text.trim())
            let cover = this.imageOf(doc.querySelector('img.image-comic'))

            // the site lists chapters newest first; Venera expects oldest first
            let entries = []
            let updateTime = undefined
            let rows = doc.querySelectorAll('div.list-chapter li.row:not(.heading):not([style])')
            rows.forEach((row, i) => {
                let a = row.querySelector('a')
                if (!a) return
                entries.push([this.toPath(a.attributes['href']), a.text.trim()])
                if (i === 0) {
                    updateTime = this.toDate(row.querySelector('.chapters + div')?.text)
                }
            })
            let chapters = {}
            entries.reverse().forEach(([k, v]) => {
                chapters[k] = v
            })

            let tags = {}
            if (author) tags['Tác giả'] = [author]
            if (status) tags['Trạng thái'] = [status]
            if (genres.length) tags['Thể loại'] = genres

            doc.dispose()

            return new ComicDetails({
                title: title,
                subTitle: author,
                cover: cover,
                description: description,
                tags: tags,
                chapters: chapters,
                updateTime: updateTime,
                url: this.abs(id),
            })
        },

        loadEp: async (comicId, epId) => {
            let doc = await this.getHtml(this.abs(epId))
            let images = []
            doc.querySelectorAll('div.page-chapter[id] img').forEach(img => {
                let a = img.attributes
                let src = this.abs(a['src'] || a['data-src'] || '')
                if (src && !images.includes(src)) images.push(src)
            })
            doc.dispose()
            return {images: images}
        },

        onImageLoad: (url, comicId, epId) => {
            return {
                headers: {
                    'Referer': this.baseUrl + '/',
                },
            }
        },

        onThumbnailLoad: (url) => {
            return {
                headers: {
                    'Referer': this.baseUrl + '/',
                },
            }
        },

        // ids are site paths such as /truyen-tranh/xxx-123
        idMatch: "^/?truyen-tranh/.+",

        onClickTag: (namespace, tag) => {
            if (namespace === 'Thể loại') {
                return {
                    page: 'category',
                    attributes: {category: tag, param: null},
                }
            }
            return {
                page: 'search',
                attributes: {keyword: tag},
            }
        },

        link: {
            domains: ['doctruyen3qhub.fit'],
            linkToId: (url) => {
                let m = url.match(/^https?:\/\/[^\/]+(\/truyen-tranh\/[^?#]+)/)
                return m ? m[1] : null
            },
        },
    }

    // ---------- settings ----------

    settings = {
        domain: {
            title: "Domain",
            type: "input",
            validator: "^https?://[^\\s]+$",
            default: "https://doctruyen3qhub.fit",
        },
    }

    translation = {
        'zh_CN': {
            'Domain': '域名',
        },
        'zh_TW': {},
        'en': {},
        'vi': {
            'Domain': 'Tên miền',
        },
    }
}
