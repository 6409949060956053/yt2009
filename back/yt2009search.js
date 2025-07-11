const fetch = require("node-fetch");
const yt2009utils = require("./yt2009utils");
const yt2009contants = require("./yt2009constants.json");
const yt2009exports = require("./yt2009exports");
const yt2009templates = require("./yt2009templates");
const yt2009waybackwatch = require("./cache_dir/wayback_watchpage")
const yt2009doodles = require("./yt2009doodles")
const yt2009languages = require("./language_data/language_engine")
const config = require("./config.json")
const fs = require("fs")
const search_code = fs.readFileSync("../search-generic-page.htm").toString();
const searchParams = require("./proto/search_request_params_pb")

let cache = require("./cache_dir/search_cache_manager")

module.exports = {
    "get_search": function(query, flags, params, callback, token, resetCache) {
        // request search and flag handling
        flags = decodeURIComponent(flags)
        query = decodeURIComponent(query)
        if(flags.includes("only_old")) {
            query += " " + this.handle_only_old(flags)
        }

        let useProto = false;
        let paramsMsg = new searchParams.SearchRequestParams()
        let filtersMsg = new searchParams.SearchRequestParams.Filter
        let protoFinal = ""
        if(params.search_sort || params.uploaded || params.high_definition
        || params.closed_captions || params.search_type || params.page
        || params.location || params.search_duration || params.four_k
        || params.three_d || params.threesixty || params.creative_commons
        || params.custom_index) {
            useProto = true
        }

        // sort options for search
        if(params.search_sort) {
            switch(params.search_sort) {
                case "video_date_uploaded": {
                    paramsMsg.setSort(2)
                    break;
                }
                case "video_view_count": {
                    paramsMsg.setSort(3)
                    break;
                }
                case "video_avg_rating": {
                    paramsMsg.setSort(1)
                    break;
                }
            }
        }

        // upload date filter
        // before: and after: options that are used by only_old
        // don't work with those so improvise
        if(params.uploaded && !flags.includes("only_old")) {
            switch(params.uploaded) {
                case "h": {
                    filtersMsg.setUploadDate(1)
                    break;
                }
                case "d": {
                    filtersMsg.setUploadDate(2)
                    break;
                }
                case "w": {
                    filtersMsg.setUploadDate(3)
                    break;
                }
                case "m": {
                    filtersMsg.setUploadDate(4)
                    break;
                }
                case "y": {
                    filtersMsg.setUploadDate(5)
                    break;
                }
            }
        } else if(params.uploaded) {
            // remove the default only_old and generate a new setting
            // after:<current_only_old - setting>
            // before:<current_only_old>
            query = query.replace(" " + this.handle_only_old(flags), "")
            let onlyOld = this.handle_only_old(flags)
            if(onlyOld.includes(" ")) {
                onlyOld = onlyOld.split(" ")[1]
            }
            let onlyOldDate = new Date(onlyOld)
            let diffUnix = 0
            switch(params.uploaded) {
                case "d": {
                    diffUnix = 1000 * 60 * 60 * 24
                    break;
                }
                case "w": {
                    diffUnix = 1000 * 60 * 60 * 24 * 7
                    break;
                }
                case "m": {
                    diffUnix = 1000 * 60 * 60 * 24 * 31
                    break;
                }
            }
            let after = new Date(onlyOldDate - diffUnix)
            let afterStr = after.getFullYear()
                         + "-" + (after.getMonth() + 1)
                         + "-" + after.getDate()
            query += " before:" + onlyOld + " after:" + afterStr
        }

        // features filter (cc/hd)
        if(params.closed_captions) {
            filtersMsg.setSubtitles(true)
        }
        if(params.high_definition) {
            filtersMsg.setHd(true)
        }
        if(params.four_k) {
            filtersMsg.setFourK(true)
        }
        if(params.three_d) {
            filtersMsg.setThreeD(true)
        }
        if(params.threesixty) {
            filtersMsg.setThreeSixtyDegrees(true)
        }
        if(params.creative_commons) {
            filtersMsg.setCreativeCommons(true)
        }

        // all/channel/playlists
        if(params.search_type) {
            switch(params.search_type) {
                case "search_videos": {
                    filtersMsg.setType(1)
                    break;
                }
                case "search_users": {
                    filtersMsg.setType(2)
                    break;
                }
                case "search_playlists": {
                    filtersMsg.setType(3)
                    break;
                }
                case "search_movies": {
                    filtersMsg.setType(4)
                    break;
                }
            }
        }

        if(params.search_duration) {
            switch(params.search_duration) {
                case "short": {
                    filtersMsg.setDuration(1)
                    break;
                }
                case "long": {
                    filtersMsg.setDuration(2)
                    break;
                }
            }
        }

        if(params.location) {
            filtersMsg.setLocation(1)
            filtersMsg.setLocationParam(params.location)
        }

        // paging
        if(params.page) {
            if(isNaN(parseInt(params.page))) {
                params.page = 1
            }
            paramsMsg.setIndex(parseInt(params.page) * 20)
        }

        if(params.custom_index) {
            if(isNaN(parseInt(params.custom_index))) {
                params.custom_index = 1
            }
            paramsMsg.setIndex(parseInt(params.custom_index))
        }

        if(useProto) {
            paramsMsg.setFilter(filtersMsg)
            protoFinal = Buffer.from(
                paramsMsg.serializeBinary()
            ).toString("base64")
        }

        if(cache.read()[query + protoFinal] && !resetCache) {
            // cached data
            callback(cache.read()[query + protoFinal])
            if(config.env == "dev") {
                console.log(`(${token}) ${query} from cache ${Date.now()}`)
            }
        } else {
            // fetch
            if(config.env == "dev") {
                console.log(`(${token}) ${query} clean fetch ${Date.now()}`)
            }

            // construct requestbody
            let requestBody = {
                "context": yt2009contants.cached_innertube_context,
                "query": query
            }
            if(protoFinal) {
                requestBody.params = protoFinal
            }

            // send request
            fetch(`https://www.youtube.com/youtubei/v1/search?key=${
                yt2009exports.read().api_key
            }`, {
                "headers": yt2009contants.headers,
                "referrer": "https://www.youtube.com/",
                "referrerPolicy": "strict-origin-when-cross-origin",
                "body": JSON.stringify(requestBody),
                "method": "POST",
                "mode": "cors"
            }).then(r => (r.json().then(r => {
                let resultsToCallback = []
                resultsToCallback = yt2009utils.search_parse(r)
                
                // cache only if no live videos
                let liveVidCount = resultsToCallback.filter(s => {
                    return s.type == "live-video"
                }).length
                if(liveVidCount == 0) {
                    cache.write(
                        query + protoFinal,
                        JSON.parse(JSON.stringify(resultsToCallback))
                    )
                }
                
                callback(JSON.parse(JSON.stringify(resultsToCallback)))
            })))
        }
    },

    "apply_search_html": function(results, query, flags, req) {
        // apply get_search results to html
        let code = search_code;
        let results_html = ``
        let search_type = "all"
        let userAgent = req.headers["user-agent"]
        let browser = userAgent.includes("Firefox/") ? "firefox" : "chrome"
        let url = req.originalUrl.split("\"").join("&quot;")
        let protocol = req.protocol
        
        let params = url.split("&")
        if(params[0].includes("?")) {
            params[0] = params[0].split("?")[1]
        }
        // properly show chosen filters
        let sort = "relevance"
        let uploaded = "any"
        let type = "lang_results_all"
        let typesList = []
        let url_without_sort = url;
        let url_without_upload = url;
        let url_without_type = url;
        params.forEach(param => {
            if(!param.includes("=")) return;
            switch(param.split("=")[1]) {
                // sort
                case "video_date_uploaded": {
                    sort = "newest"
                    url_without_sort = url_without_sort.replace(
                        /[?|&]search_sort=video_date_uploaded/, ""
                    )
                    break;
                }
                case "video_date_uploaded_reverse": {
                    sort = "oldest"
                    url_without_sort = url_without_sort.replace(
                        /[?|&]search_sort=video_date_uploaded_reverse/, ""
                    )
                    break;
                }
                case "video_view_count": {
                    sort = "views"
                    url_without_sort = url_without_sort.replace(
                        /[?|&]search_sort=video_view_count/, ""
                    )
                    break;
                }
                case "video_avg_rating": {
                    sort = "rating"
                    url_without_sort = url_without_sort.replace(
                        /[?|&]search_sort=video_avg_rating/, ""
                    )
                    break;
                }
                // upload date
                case "d": {
                    uploaded = "today"
                    url_without_upload = url_without_upload.replace(
                        /[?|&]uploaded=d/, ""
                    )
                    break;
                }
                case "w": {
                    uploaded = "week"
                    url_without_upload = url_without_upload.replace(
                        /[?|&]uploaded=w/, ""
                    )
                    break;
                }
                case "m": {
                    uploaded = "month"
                    url_without_upload = url_without_upload.replace(
                        /[?|&]uploaded=m/, ""
                    )
                    break;
                }
                // all/channels/playlists type
                case "search_users": {
                    search_type = "channel"
                    break;
                }
                case "search_playlists": {
                    search_type = "playlist"
                    break;
                }
            }
            // type
            switch(param.split("=")[0]) {
                case "partner": {
                    type = "Partner Videos"
                    typesList.push("lang_results_pv")
                    url_without_type = url_without_type.replace(
                        /[?|&]partner=1/, ""
                    )
                    break;
                }
                case "annotations": {
                    type = "Annotations"
                    typesList.push("lang_results_annotations")
                    url_without_type = url_without_type.replace(
                        /[?|&]annotations=1/, ""
                    )
                    break;
                }
                case "closed_captions": {
                    type = "Closed Captions"
                    typesList.push("lang_results_cc")
                    url_without_type = url_without_type.replace(
                        /[?|&]closed_captions=1/, ""
                    )
                    break;
                }
                case "high_definition": {
                    type = "HD"
                    typesList.push("lang_results_hd")
                    url_without_type = url_without_type.replace(
                        /[?|&]high_definition=1/, ""
                    )
                    break;
                }
            }
        })
        if(typesList.length == 0) {
            typesList.push(type)
        }
        code = code.replace("chosen_sort", "lang_sort_" + sort)
        code = code.replace("chosen_upload", "lang_up_" + uploaded)
        code = code.replace("chosen_type", typesList.join(", "))
        // sort
        code = code.replace(
            "url_plus_newest", url_without_sort + "&search_sort=video_date_uploaded"
        ).replace(
            "url_plus_views", url_without_sort + "&search_sort=video_view_count"
        ).replace(
            "url_plus_rating", url_without_sort + "&search_sort=video_avg_rating"
        ).replace(
            "url_plus_relevance", url_without_sort
        )
        // upload date
        code = code.replace(
            "url_plus_today", url_without_upload + "&uploaded=d"
        ).replace(
            "url_plus_week", url_without_upload + "&uploaded=w"
        ).replace(
            "url_plus_month", url_without_upload + "&uploaded=m"
        ).replace(
            "url_plus_anytime", url_without_upload
        )
        // type
        code = code.replace(
            "url_plus_cc", url_without_type + "&closed_captions=1"
        ).replace(
            "url_plus_hd", url_without_type + "&high_definition=1"
        ).replace(
            "url_plus_type_all", url_without_type
        )

        code = require("./yt2009loginsimulate")(flags, code, true)
        
        if(flags.includes("shows_tab")) {
            // shows tab
            code = code.replace(
                `<a href="/channels">lang_channels</a>`,
                `<a href="/channels">lang_channels</a><a href="#">lang_shows</a>`
            )
        }

        let estResults = 0;

        // fake_dates handle
        let vIndex = 0;
        let cutoffDate = false;
        if(flags.includes("fake_dates")) {
            if(flags.includes("only_old")) {
                let onlyOld = flags.split("only_old")[1].split(";")[0]
                if(onlyOld.includes(" ")) {
                    onlyOld = onlyOld.split(" ")[1]
                }
                if(onlyOld.length == 0) {
                    onlyOld = "2010-04-01"
                }
                cutoffDate = onlyOld
            } else {
                let cutoffDates = []
                results.forEach(v => {
                    if(!v.upload) return;
                    cutoffDates.push(new Date(
                        yt2009utils.relativeToAbsoluteApprox(v.upload)
                    ).getTime())
                })
                cutoffDates = cutoffDates.sort((a, b) => b - a)
                cutoffDate = yt2009utils.fakeDatesScale(cutoffDates)
                cutoffDate.reverse()
            }
        }

        results.forEach(result => {
            switch(result.type) {
                case "video":
                case "live-video": {
                    let cancelled = false;
                    let video = result;

                    // flags
                    let uploadDate = video.upload

                    let onlyOld = "before:2010-04-01"
                    let yearsDiff = 13;
                    if(flags.includes("only_old")) {
                        onlyOld = this.handle_only_old(flags);
                        if(onlyOld.includes("before:")) {
                            let beforeYear = onlyOld.split("before:")[1]
                                                    .split("-")[0]
                            yearsDiff = new Date().getFullYear()
                                        - parseInt(beforeYear)
                        }
                    }
                    if(flags.includes("only_old") &&
                    ((!uploadDate.includes("years"))
                    || (uploadDate.includes("years")
                    && parseInt(uploadDate.split(" ")[0]) < yearsDiff - 1))) {
                        cancelled = true;
                    }

                    if(cutoffDate) {
                        if(typeof(cutoffDate) == "string") {
                            uploadDate = yt2009utils.fakeDatesModern(
                                cutoffDate, video.upload
                            )
                        } else {
                            uploadDate = cutoffDate[vIndex]
                        }
                        vIndex++
                    }

                    let uploaderName = video.author_name;
                    if(flags.includes("remove_username_space")) {
                        uploaderName = uploaderName.split(" ").join("")
                    }
                    if(flags.includes("username_asciify")) {
                        uploaderName = yt2009utils.asciify(uploaderName)
                    }
                    if(flags.includes("author_old_names")
                    && video.author_url.includes("/user/")) {
                        uploaderName = video.author_url.split("/user/")[1]
                    }
                    let viewCount = video.views
                    if(flags.includes("realistic_view_count")
                    && parseInt(viewCount.replace(/[^0-9]/g,  "")) >= 100000) {
                        viewCount = yt2009utils.countBreakup(
                            Math.floor(
                                parseInt(viewCount.replace(/[^0-9]/g, "")) / 90
                            )
                        ) + " views"
                    }

                    // wayback machine into search
                    let waybackData = yt2009waybackwatch.readCacheOnly(video.id)
                    let title = video.title
                    let description = video.description;
                    if(waybackData) {
                        title = waybackData.title
                                ? waybackData.title
                                : video.title
                        description = waybackData.description
                                      ? waybackData.description
                                      : video.description
                        if(waybackData.authorName
                        && !waybackData.authorName.toLowerCase()
                                       .includes("subscribe")) {
                            uploaderName = waybackData.authorName
                        }
                    }

                    // verified check if partner=1
                    if(typesList.includes("Partner Videos")
                    && (!video.verified && !video.artist)) {
                        cancelled = true;
                    }

                    try {
                        uploadDate = yt2009utils.relativeTimeCreate(
                            uploadDate, yt2009languages.get_language(req)
                        )
                    }
                    catch(error) {uploadDate = ""}
                    viewCount = "lang_views_prefix" + yt2009utils.countBreakup(
                        parseInt(yt2009utils.bareCount(viewCount))
                    ) + "lang_views_suffix"

                    // live adjustments
                    if(result.type == "live-video") {
                        viewCount = yt2009utils.countBreakup(
                            parseInt(yt2009utils.bareCount(viewCount))
                        ) + " watching"
                    }

                    // fake flag for autogen_thumbnails to ignore live
                    let liveVideoFlag = ""
                    if(result.type == "live-video") {
                        liveVideoFlag += ":live_video"
                    }
    
                    // apply html
                    if(!cancelled) {
                        results_html += yt2009templates.searchVideo(
                            video.id,
                            title,
                            description,
                            video.author_url,
                            uploaderName,
                            uploadDate,
                            viewCount,
                            video.time,
                            protocol,
                            browser,
                            flags + liveVideoFlag
                        )
                    }

                    break;
                }
                case "channel": {
                    if(search_type == "playlist") return;
                    let channel = result;
                    results_html += yt2009templates.searchChannel(
                        channel.url,
                        channel.avatar,
                        channel.name,
                        channel.subscribers
                    )
                    break;
                }
                case "playlist": {
                    if(search_type == "channel") return;
                    let playlist = result;
                    results_html += yt2009templates.searchPlaylistEntry(
                        playlist.id,
                        protocol,
                        playlist.videos,
                        playlist.name,
                        playlist.videoCount,
                        playlist.a,
                        flags
                    );

                    playlist.videos.forEach(video => {
                        results_html += yt2009templates.searchPlaylistVideo(
                            video, playlist
                        )
                    })

                    results_html += yt2009templates.searchPlaylistEnd(playlist)

                    break;
                }
                case "metadata": {
                    estResults = result.resultCount
                    if(estResults == 0) {
                        code = code.replace(
                            `<!--yt2009_no_results-->`,
                            yt2009templates.searchNoResults(yt2009utils.xss(query))
                        )
                    }
                    break;
                }
            }
        })
        
        if(results.length == 0) {
            code = code.replace(
                `<!--yt2009_no_results-->`,
                yt2009templates.searchNoResults(yt2009utils.xss(query))
            )
        }

        let visibleNames = {
            "channel": "Channels",
            "all": "All",
            "playlist": "Playlists"
        }

        code = code.replace(
            `<span class="yt2009-hook-${search_type}-selected search-type-not-selected"><a href="yt2009_search_${search_type}_link">${visibleNames[search_type]}</a></span>`,
            `<span class="yt2009-hook-${search_type}-selected search-type-selected" href="yt2009_search_${search_type}_link">${visibleNames[search_type]}</span>`
        )

        let resultsUrl = `/results?search_query=${query.split(" ").join("+").split("\"").join("&quot;")}`
        code = code.replace(
            `yt2009_search_all_link`,
            resultsUrl
        )
        code = code.replace(
            `yt2009_search_channel_link`,
            `${resultsUrl}&search_type=search_users`
        )
        code = code.replace(
            `yt2009_search_playlist_link`,
            `${resultsUrl}&search_type=search_playlists`
        )
        code = code.replace(`yt2009_fill_flags`, flags)
        code = code.split(`yt2009_search_query`).join(yt2009utils.xss(query).split("\"").join("&quot;"))
        code = code.replace(`yt2009_title_query`, yt2009utils.xss(query))
        code = code.replace(`<!--yt2009_results-->`, results_html)

        // paging
        let currentPage = 1;
        params.forEach(param => {
            if(param.startsWith("page=")) {
                currentPage = parseInt(param.split("page=")[1])
            }
        })
        // initial page numbers
        let pageNumbers = [
            currentPage - 3,
            currentPage - 2,
            currentPage - 1,
            currentPage,
            currentPage + 1,
            currentPage + 2,
            currentPage + 3
        ]
        // fixup in case of negative/zero
        pageNumbers.forEach(pageNumber => {
            if(pageNumber <= 0) {
                pageNumbers = pageNumbers.filter(s => s !== pageNumber)
                pageNumbers.push(pageNumbers[pageNumbers.length - 1] + 1)
            }
        })
        if(!url.includes("page=")) {
            url += "&page=1"
        }
        let pagingHTML = ``
        // show a previous page button if more than 1
        if(currentPage > 1) {
            let previous = url.replace(
                "page=" + currentPage,
                "page=" + (currentPage - 1)
            )
            pagingHTML += `<a href="${previous}" class="pagerNotCurrent">Previous</a>`
        }
        // create paging buttons if they fit within
        // estResults / 20 (estimated max page count)
        pageNumbers.forEach(page => {
            if(estResults / 20 >= page * 20 || !estResults) {
                if(page == currentPage) {
                    pagingHTML += `<span class="pagerCurrent">${currentPage}</span>`
                } else {
                    let pageLink = url.replace("page=" + currentPage, "page=" + page)
                    pagingHTML += `<a href="${pageLink}" class="pagerNotCurrent">${page}</a>`
                }
            }
        })

        if(estResults / 20 > currentPage * 20 || !estResults) {
            let next = url.replace(
                "page=" + currentPage,
                "page=" + (currentPage + 1)
            )
            pagingHTML += `...<a href="${next}" class="pagerNotCurrent">Next</a>`
        }

        code = code.replace(
            `<!--yt2009_pager-->`,
            pagingHTML
        )

        code = yt2009doodles.applyDoodle(code, req)

        let baseUrl = `/results?search_query=${query.split(" ").join("+")}`
        code = code.replace(
            `var YT2009_BASE_SEARCH_URL = "";`,
            `var YT2009_BASE_SEARCH_URL = "${baseUrl}";`
        )

        code = yt2009languages.apply_lang_to_code(code, req)

        return code;
    },

    "related_from_keywords": function(keyword, sourceId, watch_flags, callback, protocol, disableOld) {
        this.get_search(keyword, disableOld ? "" : "only_old", "", (data) => {
            if(!data) {
                callback("", "")
                return;
            }
            let related_html = ``
            let rawData = []
            JSON.parse(JSON.stringify(data)).forEach(result => {
                if(result.type == "video" && result.id !== sourceId) {
                    // handle flag
                    // author name flags
                    let authorName = result.author_name;
                    if(watch_flags.includes("remove_username_space")) {
                        authorName = authorName.split(" ").join("")
                    }
                    if(watch_flags.includes("username_asciify")) {
                        authorName = yt2009utils.asciify(authorName)
                    }
                    if(watch_flags.includes("author_old_names")
                    && result.author_url.includes("/user/")) {
                        authorName = result.author_url.split("/user/")[1]
                                                      .split("?")[0]
                    }
    
                    // view count flags
                    let viewCount = result.views;
                    if(watch_flags.includes("realistic_view_count")
                    && parseInt(viewCount.replace(/[^0-9]/g, "")) >= 100000) {
                        viewCount = yt2009utils.countBreakup(Math.floor(
                            parseInt(viewCount.replace(/[^0-9]/g, "")) / 90
                        )) + " views"
                    }

                    // html view count (include the lang strings)
                    let htmlViewCount = viewCount;
                    htmlViewCount = parseInt(viewCount.replace(/[^0-9]/g, ""))
                    htmlViewCount = "lang_views_prefix"
                                  + yt2009utils.countBreakup(htmlViewCount)
                                  + "lang_views_suffix"

                    related_html += yt2009templates.relatedVideo(
                        result.id,
                        result.title,
                        protocol,
                        result.time,
                        htmlViewCount,
                        result.author_url,
                        authorName,
                        watch_flags
                    )

                    rawData.push({
                        "id": result.id,
                        "title": result.title,
                        "length": result.time,
                        "views": viewCount,
                        "creatorUrl": result.author_url,
                        "creatorName": authorName,
                        "creatorHandle": result.author_handle,
                        "upload": result.upload,
                        "description": result.description
                    })
                }
            })
    
            callback(related_html, rawData)
        }, "exp_related")
    },

    "handle_only_old": function(flags) {
        let onlyOldFlag = ""
        let resultSyntax = ""
        flags.split(";").forEach(flag => {
            if(flag.startsWith("only_old")) {
                onlyOldFlag = flag;
            }
        })
        onlyOldFlag = onlyOldFlag.replace(":", "")
        if(onlyOldFlag.includes(" ")) {
            // 2 dates
            resultSyntax = "after:" + onlyOldFlag.split(" ")[0]
                                      .replace("only_old", "")
                            + " before:" + onlyOldFlag.split(" ")[1]
        } else if(onlyOldFlag !== "only_old") {
            // 1 date
            resultSyntax = "before:" + onlyOldFlag.replace("only_old", "")
        } else {
            // no dates
            resultSyntax = "before:2010-04-01"
        }

        // adaptive_old - current day/month but only_old year
        if(flags.includes("adaptive_old")) {
            if(resultSyntax.includes("before:")) {
                let year = resultSyntax.split("before:")[1].split("-")[0]
                let date = new Date()
                let month = date.getMonth() + 1
                let day = date.getDate() + 1
                resultSyntax = `before:${year}-${month}-${day}`
            }
        }
        
        return resultSyntax;
    },

    "get_channel_vids_from_search": function(channelName, additionalQuery, params, channelId) {
        // loop search pages until we get 10 vids from a channel
        let matchingResults = []
        let page = 1;
        let getSearch = this.get_search
        function getNextPage() {
            let p = params || {};
            p.page = page;
            getSearch(`${channelName} ${additionalQuery}`, "", p,
            (data) => {
                console.log(data)
            }, "", false)
        }
        
    }
}