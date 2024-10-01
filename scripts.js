// Define the window.dispatchMessages function
window.dispatchMessages = function (messages, timeout) {
    messages.forEach(message => {
        const notification = document.createElement('div');
        notification.className = `notification ${message.type}`;
        notification.innerText = `${message.type.toUpperCase()}: ${message.text}`;
        document.body.appendChild(notification);

        if (timeout > 0) {
            setTimeout(() => {
                notification.remove();
            }, timeout);
        }
    });
};

// Define the dispatchMessage function
function dispatchMessage(type, message, timeout) {
    window.dispatchMessages([{ type: type, text: message }], timeout);
}

function initSankakuTools() {
    return {
        API_URL: "https://capi-v2.sankakucomplex.com",
        LOGIN_URL: "https://capi-v2.sankakucomplex.com/auth/token",
        TAG_WIKI_URL: "https://capi-v2.sankakucomplex.com/tag-and-wiki/name/",
        FOLLOWING_URL: "https://sankakuapi.com/users/followings?lang=en",
        TAG_SEARCH_AUTO_SUGGEST_CREATING_URL: "https://sankakuapi.com/tags/autosuggestCreating?lang=en&tag=",
        isLoading: false,
        loginData: {
            login: '',
            password: ''
        },
        initialized: false,
        token: {
            type: '',
            access_token: '',
            refresh_token: '',
            access_token_ttl: 0,  // Token time-to-live in seconds
            refresh_token_ttl: 0,  // Refresh token time-to-live in seconds
            expiry_date: null,     // Access token expiry date
            refresh_expiry_date: null,  // Refresh token expiry date
            hasToken: false,       // Track if token is available
        },
        selectedFile: null,
        tags: [],
        followingTags: [],
        lastFetchFollowingTagsTime: null,
        sortBy: '', // Current sorting field ('name' or 'following')
        sortDesc: false, // Track sorting direction
        selectedTags: [],
        recentlyUnfollowedTags: [],
        selectedAll: false,
        selectedFollowFilter: "all",
        selectedFetchFilter: "all",
        filteredTags: [],
        currentSearchInputElement: null,
        searchTagSuggestions: [],
        searchTagSuggestionsFetched: false,

        dispatchMessage(type, message, timeout) {
            window.dispatchMessages([{ type: type, text: message }], timeout);
        },

        // Check local storage on init
        init() {
            if (this.initialized) return;
            this.initialized = true;
            const savedToken = localStorage.getItem('skkToken');

            if (savedToken) {
                // Load token details from local storage
                this.token = JSON.parse(savedToken);

                // Check token expiry
                this.checkTokenExpiry();
            }

            // Get all local storage values related to tags
            this.getLocalStorageForTags()

            // check if last fetch was more than 5 minutes ago
            if (this.getLastFetchTime() > 300) {
                this.dispatchMessage("warning", "Last fetch was more than 5 minutes ago. You should fetch following tags again.", 5000);
            }
        },

        getLocalStorageForTags() {
            // Get all local storage values related to tags
            const storedLocalTags = localStorage.getItem('localTags');
            if (storedLocalTags) {
                // Map file content from local storage to tags
                this.tags = JSON.parse(storedLocalTags).map(tag => ({
                    id: tag.id ?? null,
                    name: tag.name,
                    fetched: tag.fetched ?? null,
                    following: tag.following ?? false
                })
                );
            }

            const storedFollowingTags = localStorage.getItem('followingTags');
            if (storedFollowingTags) {
                this.followingTags = JSON.parse(storedFollowingTags);
            }

            const storedLastFetchTime = localStorage.getItem('lastFetchFollowingTagsTime');
            if (storedLastFetchTime) {
                this.lastFetchFollowingTagsTime = storedLastFetchTime;
            }

            const storedRecentlyUnfollowedTags = localStorage.getItem('recentlyUnfollowedTags');
            if (storedRecentlyUnfollowedTags) {
                this.recentlyUnfollowedTags = JSON.parse(storedRecentlyUnfollowedTags);
            }

            this.filteredTags = this.tags
        },

        updateLocalStorageForTags() {
            // update all local storage values related to tags
            localStorage.setItem('localTags', JSON.stringify(this.tags));
            localStorage.setItem('followingTags', JSON.stringify(this.followingTags));
            localStorage.setItem('lastFetchFollowingTagsTime', this.lastFetchFollowingTagsTime);
            localStorage.setItem('recentlyUnfollowedTags', JSON.stringify(this.recentlyUnfollowedTags));
        },

        getToken() {
            this.isLoading = true;
            fetch(this.LOGIN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.loginData)
            })
                .then(response => {
                    if (response.redirected) {
                        window.location.href = response.url;
                    } else if (response.ok) {
                        return response.json();
                    } else {
                        this.dispatchMessage("warning", "Invalid credentials or unknown error!", 5000);
                        this.isLoading = false;
                    }
                })
                .then(data => {
                    this.isLoading = false;
                    if (data.success && data.token_type && data.access_token && data.refresh_token) {
                        // Store token information
                        this.token.type = data.token_type;
                        this.token.access_token = data.access_token;
                        this.token.refresh_token = data.refresh_token;
                        this.token.access_token_ttl = data.access_token_ttl;
                        this.token.refresh_token_ttl = data.refresh_token_ttl;
                        this.token.hasToken = true;

                        // Calculate expiry dates
                        const now = new Date();
                        this.token.expiry_date = new Date(now.getTime() + this.token.access_token_ttl * 1000);
                        this.token.refresh_expiry_date = new Date(now.getTime() + this.token.refresh_token_ttl * 1000);

                        // Store token details in localStorage
                        localStorage.setItem('skkToken', JSON.stringify(this.token));

                        this.dispatchMessage("success", "Login successful! Tokens saved.", 3000);
                        this.checkTokenExpiry();
                    } else {
                        this.dispatchMessage("warning", "Invalid credentials or unknown error!", 5000);
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    this.isLoading = false;
                });
        },

        checkTokenExpiry() {
            const now = new Date();

            if (this.token.expiry_date) {
                const accessTokenExpiresIn = Math.round((this.token.expiry_date - now) / 1000);
                if (accessTokenExpiresIn <= 0) {
                    this.dispatchMessage("warning", "Access token has expired. Please log in again.", 5000);
                    this.token.hasToken = false;
                } else if (accessTokenExpiresIn <= 3600) {
                    this.dispatchMessage("warning", `Access token will expire in ${Math.round(accessTokenExpiresIn / 60)} minutes.`, 5000);
                }
            }

            if (this.token.refresh_expiry_date) {
                const refreshTokenExpiresIn = Math.round((this.token.refresh_expiry_date - now) / 1000);
                if (refreshTokenExpiresIn <= 0) {
                    this.dispatchMessage("warning", "Refresh token has expired. Please log in again.", 5000);
                    this.token.hasToken = false;
                } else if (refreshTokenExpiresIn <= 86400) {
                    this.dispatchMessage("warning", `Refresh token will expire in ${Math.round(refreshTokenExpiresIn / 3600)} hours.`, 5000);
                }
            }
        },

        copyToken() {
            const tokenText = this.$refs.token.textContent;

            if (navigator.clipboard && navigator.clipboard.writeText) {
                // Use the clipboard API if available
                navigator.clipboard
                    .writeText(tokenText)
                    .then(() => {
                        this.dispatchMessage("success", "Token copied!", 5000);
                    })
                    .catch(err => {
                        console.error('Error copying token: ', err);
                    });
            } else {
                // Fallback approach for unsupported browsers
                const textarea = document.createElement('textarea');
                textarea.value = tokenText;
                textarea.style.position = 'absolute';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    document.execCommand('copy');
                    this.dispatchMessage("success", "Token copied!", 5000);
                } catch (err) {
                    console.error('Fallback: Error copying token', err);
                }
                document.body.removeChild(textarea);
            }
        },

        copyRefreshToken() {
            const tokenText = this.$refs.refreshToken.textContent;

            if (navigator.clipboard && navigator.clipboard.writeText) {
                // Use the clipboard API if available
                navigator.clipboard
                    .writeText(tokenText)
                    .then(() => {
                        this.dispatchMessage("success", "Refresh Token copied!", 5000);
                    })
                    .catch(err => {
                        console.error('Error copying token: ', err);
                    });
            } else {
                // Fallback approach for unsupported browsers
                const textarea = document.createElement('textarea');
                textarea.value = tokenText;
                textarea.style.position = 'absolute';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    document.execCommand('copy');
                    this.dispatchMessage("success", "Refresh Token copied!", 5000);
                } catch (err) {
                    console.error('Fallback: Error copying refresh token', err);
                }
                document.body.removeChild(textarea);
            }
        },

        handleFileUpload(event) {
            this.selectedFile = event.target.files[0];
        },

        processFile() {
            if (!this.selectedFile) {
                this.dispatchMessage("warning", "Please select a file!", 5000);
                return;
            }

            this.isLoading = true;
            const reader = new FileReader();

            reader.onload = (event) => {
                const fileContent = event.target.result.split('\n');

                // Save each line to tags array
                // Skip empty lines and lines starting with # or // or duplicate names, case-insensitive
                fileContent.forEach(line => {
                    const trimmedLine = line.trim();
                    if (trimmedLine && !trimmedLine.startsWith('#') && !trimmedLine.startsWith('//')) {
                        const tagName = trimmedLine.toLowerCase();
                        if (!this.tags.some(tag => tag.name.toLowerCase() === tagName)) {
                            this.tags.push({ name: tagName, fetched: false, following: false });
                        }
                    }
                });

                // Update local storage
                this.updateLocalStorageForTags();
            };

            reader.readAsText(this.selectedFile);

            this.filteredTags = this.tags;

            this.isLoading = false;
        },

        fetchTagWiki(tag, fetchAll = false) {
            if (!fetchAll && tag.fetched === true) {
                this.dispatchMessage("warning", "Tag already fetched!", 5000);
                return;
            }

            if (fetchAll && tag.fetched === true) {
                return;
            }

            this.isLoading = true;
            fetch(this.TAG_WIKI_URL + tag.name, {
                method: 'GET'
            })
                .then(response => {
                    if (response.redirected) {
                        window.location.href = response.url;
                    } else if (response.ok) {
                        return response.json();
                    } else {
                        throw new Error('Tag not found or something went wrong!');
                    }
                })
                .then(data => {
                    if (data.tag) {
                        console.log(data.tag);
                        const tagId = data.tag.id;

                        // Update tag fetching status and tag id of both alpinejs and local storage
                        this.tags = this.tags.map(locTag => {
                            if (locTag.name === tag.name) {
                                locTag.fetched = true;
                                locTag.id = tagId;
                            }
                            return locTag;
                        });

                        // Update local storage
                        this.updateLocalStorageForTags();

                        if (!fetchAll) {
                            this.dispatchMessage("success", "Tags fetching status updated!", 5000);
                        }

                        // Check token expiry
                        this.checkTokenExpiry();
                    } else {
                        if (!fetchAll) {
                            this.dispatchMessage("warning", "Unknown error!", 5000);
                        }
                    }
                    if (!fetchAll) {
                        this.isLoading = false;
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    if (!fetchAll) {
                        this.dispatchMessage("warning", error.message, 5000);
                    }

                    // Update tag fetching status and tag id of both alpinejs and local storage
                    this.tags = this.tags.map(locTag => {
                        if (locTag.name === tag.name) {
                            locTag.fetched = null;
                            locTag.id = null;
                            locTag.follwing = null;
                        }

                        return locTag;
                    });

                    // Update local storage
                    this.updateLocalStorageForTags();

                    if (!fetchAll) {
                        this.isLoading = false;
                    }
                });
        },

        async refreshAllTags() {
            // Ask if user wants to refresh all tags
            if (!confirm('Do you want to refresh all tags?')) {
                return;
            }

            this.isLoading = true; // Set loading state
            console.log('Refreshing all tags');

            const batchSize = 10; // Process 10 tags at a time
            let batchIndex = 0;

            const processBatch = async () => {
                // Get the current batch of tags
                const batch = this.tags.slice(batchIndex, batchIndex + batchSize);
                const fetchPromises = batch.map(tag => this.fetchTagWiki(tag, true));

                try {
                    // Wait for all fetches in the current batch to complete
                    await Promise.all(fetchPromises);
                    batchIndex += batchSize; // Move to the next batch

                    // If there are more tags, continue processing after a 2-second delay
                    if (batchIndex < this.tags.length) {
                        setTimeout(processBatch, 2000); // Wait 2 seconds and process next batch
                    } else {
                        this.isLoading = false; // Reset loading state
                        this.dispatchMessage("success", "All tags refreshed!", 5000);
                    }
                } catch (error) {
                    console.error('Error in refreshing tags:', error);
                    this.dispatchMessage("warning", "Some tags could not be refreshed.", 5000);
                    this.isLoading = false; // Reset loading state
                }
            };

            // Start processing the first batch
            await processBatch();
        },

        getTagPostsUrl(tag) {
            if (tag.fetched !== true) return null;
            return tag.postsUrl || `https://www.sankakucomplex.com/?tags=${tag.name}`;
        },

        getTagWikiUrl(tag) {
            if (tag.fetched !== true) return null;
            return tag.wikiUrl || `https://www.sankakucomplex.com/tag?tagName=${tag.name}`;
        },

        fetchFollowingTags() {
            this.isLoading = true;
            fetch(this.FOLLOWING_URL, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.token.access_token}`,
                    'Content-Type': 'application/json'
                }
            })
                .then(response => {
                    if (response.redirected) {
                        window.location.href = response.url;
                    } else if (response.ok) {
                        return response.json();
                    } else {
                        throw new Error('Token expired or something went wrong!');
                    }
                })
                .then(data => {
                    if (data.tags) {
                        // The response contains tags in json format, example:
                        //    {
                        //         "id": 48520,
                        //         "name_en": "Nironiro",
                        //         "name_ja": "にろ",
                        //         "type": 1,
                        //         "count": 5482,
                        //         "post_count": 5482,
                        //         "pool_count": 186,
                        //         "series_count": 0,
                        //         "locale": "en",
                        //         "rating": "e",
                        //         "version": 1,
                        //         "tagName": "nironiro",
                        //         "total_post_count": 5482,
                        //         "total_pool_count": 186,
                        //         "name": "Nironiro",
                        //         "notification_enabled": true
                        //     }

                        this.followingTags = data.tags.map(tag => ({
                            id: tag.id,
                            name: tag.name_en || tag.name_ja || tag.name, // Fallback on name if other fields are not present
                            following: true
                        }));

                        // Update this.tags: if a tag exists in followingTags, update its following status;
                        // if a tag doesn't exist, add it.
                        this.followingTags.forEach(followingTag => {
                            // Find the tag in the this.tags array
                            const foundTag = this.tags.find(tag => tag.id === followingTag.id);

                            if (foundTag) {
                                // Update existing tag's following status
                                foundTag.following = true;
                            } else {
                                // Add the new tag to this.tags if not found
                                this.tags.push({
                                    id: followingTag.id,
                                    name: followingTag.name,
                                    fetched: false,
                                    following: true
                                });
                            }
                        });

                        // Update local storage
                        this.updateLocalStorageForTags();


                        this.dispatchMessage("success", "Tags following status updated!", 5000);

                        // Check token expiry
                        this.checkTokenExpiry();
                    } else {
                        this.dispatchMessage("warning", "No data or unknown error!", 5000);
                    }

                    this.isLoading = false;
                })
                .catch(error => {
                    console.error('Error:', error);
                    this.dispatchMessage("warning", error.message, 5000);

                    // Don't update local storage on error, retain previous state
                    this.isLoading = false;
                });

            this.lastFetchFollowingTagsTime = new Date();
            this.updateLocalStorageForTags();
        },

        followTag(tag, batchAction = false) {
            if (!batchAction && tag.following === true) {
                this.dispatchMessage("warning", "Tag already followed!", 5000);
                return;
            }

            if (batchAction && tag.following === true) {
                return;
            }

            this.isLoading = true;
            fetch(this.FOLLOWING_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    'following_id': `${tag.id}`,
                    'type': "tag"
                })
            })
                .then(response => {
                    if (response.redirected) {
                        window.location.href = response.url;
                    } else if (response.ok) {
                        return response.json();
                    } else {
                        throw new Error('Token expired or something went wrong!');
                    }
                })
                .then(data => {
                    if (data.id) {
                        // Update following status in this.tags
                        this.tags = this.tags.map(locTag => {
                            if (locTag.id === data.id) {
                                locTag.following = true;  // Set following to true
                            }

                            return locTag;
                        });

                        // Check if the tag exists in followingTags and update or add
                        const foundTag = this.followingTags.find(followingTag => followingTag.id === data.id);
                        if (!foundTag) {
                            // Add tag to followingTags if not already there
                            this.followingTags.push({
                                id: tag.id,
                                name: tag.name,
                                following: true
                            });
                        } else {
                            // If it exists, ensure it's marked as following
                            this.followingTags = this.followingTags.map(followingTag => {
                                if (followingTag.id === data.id) {
                                    followingTag.following = true;
                                }
                                return followingTag;
                            });
                        }

                        // Update local storage
                        this.updateLocalStorageForTags();


                        if (!batchAction) {
                            this.dispatchMessage("success", "Tag followed!", 5000);
                        }

                        // Check token expiry
                        this.checkTokenExpiry();
                    } else {
                        if (!batchAction) {
                            this.dispatchMessage("warning", "No data or unknown error!", 5000);
                        } else {
                            throw new Error('No data or unknown error!');
                        }
                    }

                    this.isLoading = false;
                })
                .catch(error => {
                    console.error('Error:', error);
                    if (!batchAction) {
                        this.dispatchMessage("warning", error.message, 5000);
                    }

                    // Don't update local storage on error, retain previous state
                    this.isLoading = false;
                });
        },

        unfollowTag(tag, batchAction = false) {
            if (!batchAction && tag.following === false) {
                this.dispatchMessage("warning", "Tag already unfollowed!", 5000);
                return;
            }

            if (batchAction && tag.following === false) {
                return;
            }

            this.isLoading = true;
            fetch(this.FOLLOWING_URL, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    'following_id': `${tag.id}`,
                    'type': "tag"
                })
            })
                .then(response => {
                    if (response.redirected) {
                        window.location.href = response.url;
                    } else if (response.ok) {
                        return response.json();
                    } else {
                        throw new Error('Token expired or something went wrong!');
                    }
                })
                .then(data => {
                    if (data.success === true) {
                        // Update following status in this.tags
                        this.tags = this.tags.map(locTag => {
                            if (locTag.id === tag.id) {
                                locTag.following = false;  // Set following to false
                            }
                            return locTag;
                        });

                        // Remove the tag from followingTags
                        this.followingTags = this.followingTags.filter(followingTag => followingTag.id !== tag.id);

                        // Add the tag to recentlyUnfollowedTags
                        // push only if not exist
                        if (!this.recentlyUnfollowedTags.find(followedTag => followedTag.id === tag.id)) {
                            this.recentlyUnfollowedTags.push(tag);
                        }

                        // Update local storage
                        this.updateLocalStorageForTags();

                        if (!batchAction) {
                            this.dispatchMessage("success", "Tag unfollowed successfully!", 5000);
                        }

                        // Check token expiry
                        this.checkTokenExpiry();
                    } else {
                        this.dispatchMessage("warning", "No data or unknown error!", 5000);
                    }

                    this.isLoading = false;
                })
                .catch(error => {
                    console.error('Error:', error);
                    if (!batchAction) {
                        this.dispatchMessage("warning", error.message, 5000);
                    }

                    // Don't update local storage on error, retain previous state
                    this.isLoading = false;
                });
        },

        selectTag(tag) {
            tag.selected = !tag.selected

            if (tag.selected === true) {
                this.selectedTags.push(tag);
            } else {
                this.selectedTags = this.selectedTags.filter(selectedTag => selectedTag.id !== tag.id);
            }
        },

        selectAll() {
            this.selectedAll = !this.selectedAll;

            this.filteredTags.forEach(tag => {
                if (tag.fetched) {
                    tag.selected = this.selectedAll;
                }
            });

            this.selectedTags = this.selectedAll ? this.filteredTags.filter(tag => tag.selected) : [];

            console.log(this.selectedTags);
        },

        followSelectedTags() {
            if (this.selectedTags.length === 0) {
                this.dispatchMessage("warning", "No tags selected!", 5000);
                return;
            }

            // Ask if user wants to follow all tags
            if (!confirm('Do you want to follow selected tags?')) {
                return;
            }

            // check if last fetch was more than 5 minutes ago
            if (this.getLastFetchTime() > 300) {
                if (!confirm('Last fetch was more than 5 minutes ago. Do you want to fetch following status first?')) {
                    return;
                }
                this.fetchFollowingTags();
                return;
            }

            this.isLoading = true;
            console.log('Following all tags');

            const batchSize = 2;
            let batchIndex = 0;

            const processBatch = () => {
                const batch = this.selectedTags.slice(batchIndex, batchIndex + batchSize);
                const followPromises = batch.map(tag => this.followTag(tag, true));

                // Wait for all follows in the current batch to complete
                Promise.all(followPromises)
                    .then(() => {
                        batchIndex += batchSize; // Move to the next batch

                        // If there are more tags, continue processing after a 2-second delay
                        if (batchIndex < this.selectedTags.length) {
                            setTimeout(processBatch, 2000); // Wait 2 seconds and process next batch
                        } else {
                            this.isLoading = false; // Reset loading state
                            this.dispatchMessage("success", "All selected tags followed!", 5000);
                        }
                    })
                    .catch(error => {
                        console.error('Error in following tags:', error);
                        this.dispatchMessage("warning", "Some tags could not be followed.", 5000);
                        this.isLoading = false; // Reset loading state
                    });
            };

            // Start processing the first batch
            processBatch();
        },

        unFollowSelectedTags() {
            if (this.selectedTags.length === 0) {
                this.dispatchMessage("warning", "No tags selected!", 5000);
                return;
            }

            // Ask if user wants to unfollow all tags
            if (!confirm('Do you want to unfollow selected tags?')) {
                return;
            }

            // check if last fetch was more than 5 minutes ago
            if (this.getLastFetchTime() > 300) {
                if (!confirm('Last fetch was more than 5 minutes ago. Do you want to fetch following status first?')) {
                    return;
                }
                this.fetchFollowingTags();
                return;
            }

            this.isLoading = true;
            console.log('Unfollowing all tags');

            const batchSize = 2;
            let batchIndex = 0;

            const processBatch = () => {
                const batch = this.selectedTags.slice(batchIndex, batchIndex + batchSize);
                const unfollowPromises = batch.map(tag => this.unfollowTag(tag, true));

                // Wait for all unfollows in the current batch to complete
                Promise.all(unfollowPromises)
                    .then(() => {
                        batchIndex += batchSize; // Move to the next batch

                        // If there are more tags, continue processing after a 2-second delay
                        if (batchIndex < this.selectedTags.length) {
                            setTimeout(processBatch, 2000); // Wait 2 seconds and process next batch
                        } else {
                            this.isLoading = false; // Reset loading state
                            this.dispatchMessage("success", "All tags unfollowed!", 5000);
                        }
                    })
                    .catch(error => {
                        console.error('Error in unfollowing tags:', error);
                        this.dispatchMessage("warning", "Some tags could not be unfollowed.", 5000);
                        this.isLoading = false; // Reset loading state
                    });
            };

            // Start processing the first batch
            processBatch();
        },

        getLastFetchTime() {
            const lastFetchTime = this.lastFetchFollowingTagsTime || localStorage.getItem('lastFetchFollowingTagsTime');
            return lastFetchTime ? Math.abs(new Date() - new Date(lastFetchTime)) / 1000 : 999999999;
        },

        sortTags(attribute) {
            // Toggle sorting direction if the same header is clicked again
            if (this.sortBy === attribute) {
                this.sortDesc = !this.sortDesc;
            } else {
                this.sortBy = attribute;
                this.sortDesc = false; // Default to ascending when changing sort attribute
            }

            // Sort based on the attribute
            this.tags.sort((a, b) => {
                let valA = a[attribute];
                let valB = b[attribute];

                // Handle case-insensitive sorting for strings (e.g., 'name')
                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();

                if (valA < valB) return this.sortDesc ? 1 : -1;
                if (valA > valB) return this.sortDesc ? -1 : 1;
                return 0;
            });

            // Update local storage
            this.updateLocalStorageForTags();
        },

        filterTags() {
            this.filteredTags = this.tags.filter((e) => {
                let t = "all" === this.selectedFollowFilter || e.following == this.selectedFollowFilter;

                if (this.selectedFetchFilter === "all") {
                    return t;
                }

                if (this.selectedFetchFilter === "0") {
                    return t && (e.fetched === false || e.fetched === null);
                }

                if (this.selectedFetchFilter === "1") {
                    return t && e.fetched === true;
                }
            });
        },

        downloadTagsJson() {
            // Prepare the data
            const data = this.tags.map(tag => ({
                id: tag.id,
                name: tag.name,
                postsUrl: this.getTagPostsUrl(tag),
                wikiUrl: this.getTagWikiUrl(tag),
                following: tag.following
            }));

            // Convert the modified tags array to JSON
            const tagsJson = JSON.stringify(data, null, 2); // Formatting for readability
            const blob = new Blob([tagsJson], { type: 'application/json' });

            // Open a new tab and display the JSON data with URLs
            const newTab = window.open();
            newTab.document.write(`<pre>${tagsJson}</pre>`); // Display JSON in a readable format
            newTab.document.close();

            // Optionally revoke the blob URL to free memory (after it's used)
            URL.revokeObjectURL(newTab);
        },

        directDownloadTagsJson() {
            // Prepare the data
            const data = this.tags.map(tag => ({
                id: tag.id,
                name: tag.name,
                postsUrl: this.getTagPostsUrl(tag),
                wikiUrl: this.getTagWikiUrl(tag),
                following: tag.following
            }));

            // Convert the data to JSON format
            const jsonContent = JSON.stringify(data, null, 2);

            // Create a Blob from the JSON data
            const blob = new Blob([jsonContent], { type: "application/json" });

            // Create a download link and trigger it
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'tags.json';
            link.click();

            // Cleanup the URL object
            URL.revokeObjectURL(url);
        },

        getTagSearchSuggestions(inputElement) {
            const term = inputElement.value.trim();

            // If the input element changes, reset the fetched status to refetch
            if (this.currentSearchInputElement !== inputElement) {
                this.searchTagSuggestionsFetched = false;
                this.currentSearchInputElement = inputElement;
            }

            // If no input, clear suggestions and return
            if (term.length === 0) {
                this.searchTagSuggestions = [];
                this.searchTagSuggestionsFetched = false;
                return;
            }

            // If suggestions are already fetched, display them directly
            if (this.searchTagSuggestionsFetched) {
                this.showSuggestions(inputElement);
                return;
            }

            fetch(this.TAG_SEARCH_AUTO_SUGGEST_CREATING_URL + inputElement.value, {
                method: 'GET'
            })
                .then(response => response.json())
                .then(data => {
                    if (data.length > 0) {
                        this.searchTagSuggestions = data;
                        this.searchTagSuggestionsFetched = true; // Mark suggestions as fetched
                        this.showSuggestions(inputElement);
                    } else {
                        this.searchTagSuggestions = [];
                        this.searchTagSuggestionsFetched = false;
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    this.dispatchMessage("warning", error.message, 5000);
                    this.searchTagSuggestions = [];
                    this.searchTagSuggestionsFetched = false;
                });
        },

        // Position the suggestion container below the active input
        showSuggestions(inputElement) {
            // Find the closest parent div of the input element
            const closestDiv = inputElement.closest('div');

            // If the closest div exists, append the suggestions container to it
            if (closestDiv) {
                const suggestionsContainer = this.$refs.suggestionsContainer;

                // Remove the suggestions container from the previous parent (if any)
                if (suggestionsContainer.parentNode) {
                    suggestionsContainer.parentNode.removeChild(suggestionsContainer);
                }

                // Append the suggestions container to the closest div
                closestDiv.appendChild(suggestionsContainer);

                // Position it correctly relative to the input element
                suggestionsContainer.classList.remove('hidden');
                suggestionsContainer.style.position = 'absolute';
                suggestionsContainer.style.top = `${inputElement.offsetTop + inputElement.offsetHeight}px`;
                suggestionsContainer.style.left = `${inputElement.offsetLeft}px`;
            }
        },

        hideSuggestions() {
            const suggestionsContainer = this.$refs.suggestionsContainer;
            suggestionsContainer.classList.add('hidden');
        },

        showTagsUrl(tag, $el) {
            // Find the closest parent div of the input element
            const closestDiv = $el.closest('div');

            if (closestDiv) {
                const tagUrlsContainer = this.$refs.tagUrlsContainer;

                // Remove the container from the previous parent (if any)
                if (tagUrlsContainer.parentNode) {
                    tagUrlsContainer.parentNode.removeChild(tagUrlsContainer);
                }

                // Append the container to the closest div
                closestDiv.appendChild(tagUrlsContainer);

                // Position it correctly relative to the input element
                tagUrlsContainer.classList.remove('hidden');
                tagUrlsContainer.style.position = 'absolute';
                tagUrlsContainer.style.bottom = `${$el.offsetTop + $el.offsetHeight}px`;
                tagUrlsContainer.style.left = `${$el.offsetLeft}px`;

                // Get the url elements
                const wikiUrlEl = this.$refs.tagWikiUrlEl;
                const postsUrlEl = this.$refs.tagPostsUrlEl;

                wikiUrlEl.href = this.getTagWikiUrl(tag);
                postsUrlEl.href = this.getTagPostsUrl(tag);
            }
        },

        hideTagsUrl() {
            const tagUrlsContainer = this.$refs.tagUrlsContainer;
            tagUrlsContainer.classList.add('hidden');
        },

        applySuggestion(tag, suggestion) {
            // Apply the selected suggestion to the tag
            tag.name = suggestion.name;
            // this.searchTagSuggestions = []; // Clear suggestions after selection
            this.fetchTagWiki(tag);
            tag.isChanged = true;
        },

        // Function to format large numbers
        formatPostCount(value) {
            if (value >= 1000000) {
                return (value / 1000000).toFixed(1) + 'M'; // Format millions
            } else if (value >= 1000) {
                return (value / 1000).toFixed(1) + 'K'; // Format thousands
            }
            return value; // Return the original number if less than 1000
        },

    };
}
