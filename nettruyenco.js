/** @type {import('./_venera_.js')} */

class NetTruyenCO extends ComicSource {
    name = "NetTruyenCO"

    key = "nettruyenco"

    version = "1.0.0"

    minAppVersion = "1.6.0"

    url = "https://raw.githubusercontent.com/qhu91it/h3r0-venera-configs/main/nettruyenco.js"

    defaultBase = "https://nettruyenar.com"

    /** current site domain (configurable, these sites change domains often) */
    get baseUrl() {
        let v = this.loadSetting('baseUrl')
        return (v && v.trim() ? v.trim() : this.defaultBase).replace(/\/+$/, '')
    }

    /** @param u {string?} */
    fixUrl(u) {
        if (!u) return ''
        u = u.trim()
        if (u.startsWith('//')) return 'https:' + u
        if (u.startsWith('/')) return this.baseUrl + u
        return u
    }

    /** @param el {HtmlElement} */
    imgSrc(el) {
        let a = el.attributes
        return this.fixUrl(a['data-original'] || a['data-src'] || a['data-lazy-src'] || a['src'])
    }

    /** "https://x.com/truyen-tranh/slug-123" -> "/truyen-tranh/slug-123" */
    toPath(href) {
        return href.replace(/^https?:\/\/[^/]+/, '')
    }

    async getHtml(url, headers) {
        let res = await Network.get(url, Object.assign({
            'Referer': this.baseUrl + '/',
        }, headers || {}))
        if (res.status !== 200) {
            throw `Invalid status code: ${res.status}`
        }
        return new HtmlDocument(res.body)
    }

    /** parse a list page (popular / latest / search) */
    async loadList(url, page) {
        let doc = await this.getHtml(url)
        try {
            let comics = doc.querySelectorAll('div.items div.item').map(item => {
                let a = item.querySelector('h3 a')
                let img = item.querySelector('div.image img')
                if (!a) return null
                return new Comic({
                    id: this.toPath(a.attributes['href']),
                    title: a.text.trim(),
                    subTitle: '',
                    cover: img ? this.imgSrc(img) : '',
                })
            }).filter(e => e !== null)

            let maxPage = page
            doc.querySelectorAll('ul.pagination a').forEach(a => {
                let m = /[?&]page=(\d+)/.exec(a.attributes['href'] || '')
                if (m) maxPage = Math.max(maxPage, parseInt(m[1]))
            })
            if (doc.querySelector('a.next-page, a[rel=next]')) {
                maxPage = Math.max(maxPage, page + 1)
            }
            return {comics: comics, maxPage: maxPage}
        } finally {
            doc.dispose()
        }
    }

    explore = [
        {
            title: "NetTruyenCO - Hot",
            type: "multiPageComicList",
            load: async (page) => {
                return this.loadList(`${this.baseUrl}/truyen-tranh-hot?page=${page}`, page)
            },
        },
        {
            title: "NetTruyenCO - Latest",
            type: "multiPageComicList",
            load: async (page) => {
                return this.loadList(`${this.baseUrl}/tim-truyen?status=-1&sort=0&page=${page}`, page)
            },
        },
    ]

    search = {
        load: async (keyword, options, page) => {
            let url = `${this.baseUrl}/tim-truyen?keyword=${encodeURIComponent(keyword)}&page=${page}`
            return this.loadList(url, page)
        },
        optionList: [],
        enableTagsSuggestions: false,
    }

    comic = {
        loadInfo: async (id) => {
            let doc = await this.getHtml(this.baseUrl + id)
            let title, cover, description, tags = {}
            try {
                title = doc.querySelector('h1.title-detail')?.text.trim() ?? ''
                let img = doc.querySelector('div.col-image img')
                cover = img ? this.imgSrc(img) : ''

                let author = doc.querySelector('li.author p.col-xs-8')?.text.trim()
                if (author) tags['Author'] = [author]
                let status = doc.querySelector('li.status p.col-xs-8')?.text.trim()
                if (status) tags['Status'] = [status]
                let genres = doc.querySelectorAll('li.kind p.col-xs-8 a').map(e => e.text.trim())
                if (genres.length) tags['Genres'] = genres

                // same as the Kotlin override: join children of div.shortened with blank lines
                let shortened = doc.querySelector('div.detail-content div.shortened')
                description = shortened
                    ? shortened.children.map(e => e.text.trim()).filter(Boolean).join('\n\n')
                    : (doc.querySelector('div.detail-content')?.text.trim() ?? '')
            } finally {
                doc.dispose()
            }

            // chapters come from a JSON endpoint
            let slugAndId = id.split('/').pop()           // "slug-12345"
            let comicId = slugAndId.substring(slugAndId.lastIndexOf('-') + 1)
            let slug = slugAndId.substring(0, slugAndId.lastIndexOf('-'))

            let res = await Network.get(
                `${this.baseUrl}/Comic/Services/ComicService.asmx/ChapterList?slug=${encodeURIComponent(slug)}&comicId=${comicId}`,
                {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Referer': this.baseUrl + id,
                }
            )
            if (res.status !== 200) {
                throw `Invalid status code: ${res.status}`
            }
            let list = JSON.parse(res.body).data ?? []

            let chapters = {}
            list.forEach(c => {
                // epId = "<chapter_slug>/<chapter_id>"
                chapters[`${c.chapter_slug}/${c.chapter_id}`] = c.chapter_name
            })

            return new ComicDetails({
                title: title,
                subTitle: tags['Author']?.[0] ?? '',
                cover: cover,
                description: description,
                tags: tags,
                chapters: chapters,
                updateTime: list.length ? list[0].updated_at : undefined,
                url: this.baseUrl + id,
            })
        },

        loadEp: async (comicId, epId) => {
            let slugAndId = comicId.split('/').pop()
            let slug = slugAndId.substring(0, slugAndId.lastIndexOf('-'))
            let doc = await this.getHtml(`${this.baseUrl}/truyen-tranh/${slug}/${epId}`)
            try {
                let imgs = doc.querySelectorAll('div.page-chapter > img')
                if (!imgs.length) imgs = doc.querySelectorAll('li.blocks-gallery-item img')
                let images = imgs.map(e => this.imgSrc(e)).filter(Boolean)
                return {images: images}
            } finally {
                doc.dispose()
            }
        },

        onImageLoad: (url, comicId, epId) => {
            return {headers: {'Referer': this.baseUrl + '/'}}
        },

        onThumbnailLoad: (url) => {
            return {headers: {'Referer': this.baseUrl + '/'}}
        },

        // e.g. https://nettruyenar.com/truyen-tranh/some-title-12345
        idMatch: "/truyen-tranh/[^/\\s]+-\\d+",

        link: {
            domains: ['nettruyenar.com'],
            linkToId: (url) => {
                let m = /(\/truyen-tranh\/[^/?#]+-\d+)/.exec(url)
                return m ? m[1] : null
            },
        },
    }

    settings = {
        baseUrl: {
            title: "Site domain",
            type: "input",
            validator: "^https?://[^/\\s]+/?$",
            default: "https://nettruyenar.com",
        },
    }

    translation = {
        'zh_CN': {
            'Site domain': '网站域名',
        },
        'zh_TW': {},
        'en': {},
    }
}
