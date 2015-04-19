/** vim: et:ts=4:sw=4:sts=4
 * @license RequireJS 2.1.17 Copyright (c) 2010-2015, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */
//Not using strict: uneven strict support in browsers, #392, and causes
//problems with requirejs.exec()/transpiler plugins that may not be strict.
/*jslint regexp: true, nomen: true, sloppy: true */
/*global window, navigator, document, importScripts, setTimeout, opera */

var requirejs, require, define;
(function (global) {
    var req, s, head, baseElement, dataMain, src,
        interactiveScript, currentlyAddingScript, mainScript, subPath,
        version = '2.1.17',
        commentRegExp = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg,
        cjsRequireRegExp = /[^.]\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g,
        jsSuffixRegExp = /\.js$/,
        currDirRegExp = /^\.\//,
        op = Object.prototype,
        ostring = op.toString,
        hasOwn = op.hasOwnProperty,
        ap = Array.prototype,
        apsp = ap.splice,
        isBrowser = !!(typeof window !== 'undefined' && typeof navigator !== 'undefined' && window.document),
        isWebWorker = !isBrowser && typeof importScripts !== 'undefined',
        //PS3 indicates loaded and complete, but need to wait for complete
        //specifically. Sequence is 'loading', 'loaded', execution,
        // then 'complete'. The UA check is unfortunate, but not sure how
        //to feature test w/o causing perf issues.
        readyRegExp = isBrowser && navigator.platform === 'PLAYSTATION 3' ?
                      /^complete$/ : /^(complete|loaded)$/,
        defContextName = '_',
        //Oh the tragedy, detecting opera. See the usage of isOpera for reason.
        isOpera = typeof opera !== 'undefined' && opera.toString() === '[object Opera]',
        contexts = {},
        cfg = {},
        globalDefQueue = [],
        useInteractive = false;

    function isFunction(it) {
        return ostring.call(it) === '[object Function]';
    }

    function isArray(it) {
        return ostring.call(it) === '[object Array]';
    }

    /**
     * Helper function for iterating over an array. If the func returns
     * a true value, it will break out of the loop.
     */
    function each(ary, func) {
        if (ary) {
            var i;
            for (i = 0; i < ary.length; i += 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    /**
     * Helper function for iterating over an array backwards. If the func
     * returns a true value, it will break out of the loop.
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.length - 1; i > -1; i -= 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    function getOwn(obj, prop) {
        return hasProp(obj, prop) && obj[prop];
    }

    /**
     * Cycles over properties in an object and calls a function for each
     * property value. If the function returns a truthy value, then the
     * iteration is stopped.
     */
    function eachProp(obj, func) {
        var prop;
        for (prop in obj) {
            if (hasProp(obj, prop)) {
                if (func(obj[prop], prop)) {
                    break;
                }
            }
        }
    }

    /**
     * Simple function to mix in properties from source into target,
     * but only if target does not already have a property of the same name.
     */
    function mixin(target, source, force, deepStringMixin) {
        if (source) {
            eachProp(source, function (value, prop) {
                if (force || !hasProp(target, prop)) {
                    if (deepStringMixin && typeof value === 'object' && value &&
                        !isArray(value) && !isFunction(value) &&
                        !(value instanceof RegExp)) {

                        if (!target[prop]) {
                            target[prop] = {};
                        }
                        mixin(target[prop], value, force, deepStringMixin);
                    } else {
                        target[prop] = value;
                    }
                }
            });
        }
        return target;
    }

    //Similar to Function.prototype.bind, but the 'this' object is specified
    //first, since it is easier to read/figure out what 'this' will be.
    function bind(obj, fn) {
        return function () {
            return fn.apply(obj, arguments);
        };
    }

    function scripts() {
        return document.getElementsByTagName('script');
    }

    function defaultOnError(err) {
        throw err;
    }

    //Allow getting a global that is expressed in
    //dot notation, like 'a.b.c'.
    function getGlobal(value) {
        if (!value) {
            return value;
        }
        var g = global;
        each(value.split('.'), function (part) {
            g = g[part];
        });
        return g;
    }

    /**
     * Constructs an error with a pointer to an URL with more information.
     * @param {String} id the error ID that maps to an ID on a web page.
     * @param {String} message human readable error.
     * @param {Error} [err] the original error, if there is one.
     *
     * @returns {Error}
     */
    function makeError(id, msg, err, requireModules) {
        var e = new Error(msg + '\nhttp://requirejs.org/docs/errors.html#' + id);
        e.requireType = id;
        e.requireModules = requireModules;
        if (err) {
            e.originalError = err;
        }
        return e;
    }

    if (typeof define !== 'undefined') {
        //If a define is already in play via another AMD loader,
        //do not overwrite.
        return;
    }

    if (typeof requirejs !== 'undefined') {
        if (isFunction(requirejs)) {
            //Do not overwrite an existing requirejs instance.
            return;
        }
        cfg = requirejs;
        requirejs = undefined;
    }

    //Allow for a require config object
    if (typeof require !== 'undefined' && !isFunction(require)) {
        //assume it is a config object.
        cfg = require;
        require = undefined;
    }

    function newContext(contextName) {
        var inCheckLoaded, Module, context, handlers,
            checkLoadedTimeoutId,
            config = {
                //Defaults. Do not set a default for map
                //config to speed up normalize(), which
                //will run faster if there is no default.
                waitSeconds: 7,
                baseUrl: './',
                paths: {},
                bundles: {},
                pkgs: {},
                shim: {},
                config: {}
            },
            registry = {},
            //registry of just enabled modules, to speed
            //cycle breaking code when lots of modules
            //are registered, but not activated.
            enabledRegistry = {},
            undefEvents = {},
            defQueue = [],
            defined = {},
            urlFetched = {},
            bundlesMap = {},
            requireCounter = 1,
            unnormalizedCounter = 1;

        /**
         * Trims the . and .. from an array of path segments.
         * It will keep a leading path segment if a .. will become
         * the first path segment, to help with module name lookups,
         * which act like paths, but can be remapped. But the end result,
         * all paths that use this function should look normalized.
         * NOTE: this method MODIFIES the input array.
         * @param {Array} ary the array of path segments.
         */
        function trimDots(ary) {
            var i, part;
            for (i = 0; i < ary.length; i++) {
                part = ary[i];
                if (part === '.') {
                    ary.splice(i, 1);
                    i -= 1;
                } else if (part === '..') {
                    // If at the start, or previous value is still ..,
                    // keep them so that when converted to a path it may
                    // still work when converted to a path, even though
                    // as an ID it is less than ideal. In larger point
                    // releases, may be better to just kick out an error.
                    if (i === 0 || (i === 1 && ary[2] === '..') || ary[i - 1] === '..') {
                        continue;
                    } else if (i > 0) {
                        ary.splice(i - 1, 2);
                        i -= 2;
                    }
                }
            }
        }

        /**
         * Given a relative module name, like ./something, normalize it to
         * a real name that can be mapped to a path.
         * @param {String} name the relative name
         * @param {String} baseName a real name that the name arg is relative
         * to.
         * @param {Boolean} applyMap apply the map config to the value. Should
         * only be done if this normalization is for a dependency ID.
         * @returns {String} normalized name
         */
        function normalize(name, baseName, applyMap) {
            var pkgMain, mapValue, nameParts, i, j, nameSegment, lastIndex,
                foundMap, foundI, foundStarMap, starI, normalizedBaseParts,
                baseParts = (baseName && baseName.split('/')),
                map = config.map,
                starMap = map && map['*'];

            //Adjust any relative paths.
            if (name) {
                name = name.split('/');
                lastIndex = name.length - 1;

                // If wanting node ID compatibility, strip .js from end
                // of IDs. Have to do this here, and not in nameToUrl
                // because node allows either .js or non .js to map
                // to same file.
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                // Starts with a '.' so need the baseName
                if (name[0].charAt(0) === '.' && baseParts) {
                    //Convert baseName to array, and lop off the last part,
                    //so that . matches that 'directory' and not name of the baseName's
                    //module. For instance, baseName of 'one/two/three', maps to
                    //'one/two/three.js', but we want the directory, 'one/two' for
                    //this normalization.
                    normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                    name = normalizedBaseParts.concat(name);
                }

                trimDots(name);
                name = name.join('/');
            }

            //Apply map config if available.
            if (applyMap && map && (baseParts || starMap)) {
                nameParts = name.split('/');

                outerLoop: for (i = nameParts.length; i > 0; i -= 1) {
                    nameSegment = nameParts.slice(0, i).join('/');

                    if (baseParts) {
                        //Find the longest baseName segment match in the config.
                        //So, do joins on the biggest to smallest lengths of baseParts.
                        for (j = baseParts.length; j > 0; j -= 1) {
                            mapValue = getOwn(map, baseParts.slice(0, j).join('/'));

                            //baseName segment has config, find if it has one for
                            //this name.
                            if (mapValue) {
                                mapValue = getOwn(mapValue, nameSegment);
                                if (mapValue) {
                                    //Match, update name to the new value.
                                    foundMap = mapValue;
                                    foundI = i;
                                    break outerLoop;
                                }
                            }
                        }
                    }

                    //Check for a star map match, but just hold on to it,
                    //if there is a shorter segment match later in a matching
                    //config, then favor over this star map.
                    if (!foundStarMap && starMap && getOwn(starMap, nameSegment)) {
                        foundStarMap = getOwn(starMap, nameSegment);
                        starI = i;
                    }
                }

                if (!foundMap && foundStarMap) {
                    foundMap = foundStarMap;
                    foundI = starI;
                }

                if (foundMap) {
                    nameParts.splice(0, foundI, foundMap);
                    name = nameParts.join('/');
                }
            }

            // If the name points to a package's name, use
            // the package main instead.
            pkgMain = getOwn(config.pkgs, name);

            return pkgMain ? pkgMain : name;
        }

        function removeScript(name) {
            if (isBrowser) {
                each(scripts(), function (scriptNode) {
                    if (scriptNode.getAttribute('data-requiremodule') === name &&
                            scriptNode.getAttribute('data-requirecontext') === context.contextName) {
                        scriptNode.parentNode.removeChild(scriptNode);
                        return true;
                    }
                });
            }
        }

        function hasPathFallback(id) {
            var pathConfig = getOwn(config.paths, id);
            if (pathConfig && isArray(pathConfig) && pathConfig.length > 1) {
                //Pop off the first array value, since it failed, and
                //retry
                pathConfig.shift();
                context.require.undef(id);

                //Custom require that does not do map translation, since
                //ID is "absolute", already mapped/resolved.
                context.makeRequire(null, {
                    skipMap: true
                })([id]);

                return true;
            }
        }

        //Turns a plugin!resource to [plugin, resource]
        //with the plugin being undefined if the name
        //did not have a plugin prefix.
        function splitPrefix(name) {
            var prefix,
                index = name ? name.indexOf('!') : -1;
            if (index > -1) {
                prefix = name.substring(0, index);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }

        /**
         * Creates a module mapping that includes plugin prefix, module
         * name, and path. If parentModuleMap is provided it will
         * also normalize the name via require.normalize()
         *
         * @param {String} name the module name
         * @param {String} [parentModuleMap] parent module map
         * for the module name, used to resolve relative names.
         * @param {Boolean} isNormalized: is the ID already normalized.
         * This is true if this call is done for a define() module ID.
         * @param {Boolean} applyMap: apply the map config to the ID.
         * Should only be true if this map is for a dependency.
         *
         * @returns {Object}
         */
        function makeModuleMap(name, parentModuleMap, isNormalized, applyMap) {
            var url, pluginModule, suffix, nameParts,
                prefix = null,
                parentName = parentModuleMap ? parentModuleMap.name : null,
                originalName = name,
                isDefine = true,
                normalizedName = '';

            //If no name, then it means it is a require call, generate an
            //internal name.
            if (!name) {
                isDefine = false;
                name = '_@r' + (requireCounter += 1);
            }

            nameParts = splitPrefix(name);
            prefix = nameParts[0];
            name = nameParts[1];

            if (prefix) {
                prefix = normalize(prefix, parentName, applyMap);
                pluginModule = getOwn(defined, prefix);
            }

            //Account for relative paths if there is a base name.
            if (name) {
                if (prefix) {
                    if (pluginModule && pluginModule.normalize) {
                        //Plugin is loaded, use its normalize method.
                        normalizedName = pluginModule.normalize(name, function (name) {
                            return normalize(name, parentName, applyMap);
                        });
                    } else {
                        // If nested plugin references, then do not try to
                        // normalize, as it will not normalize correctly. This
                        // places a restriction on resourceIds, and the longer
                        // term solution is not to normalize until plugins are
                        // loaded and all normalizations to allow for async
                        // loading of a loader plugin. But for now, fixes the
                        // common uses. Details in #1131
                        normalizedName = name.indexOf('!') === -1 ?
                                         normalize(name, parentName, applyMap) :
                                         name;
                    }
                } else {
                    //A regular module.
                    normalizedName = normalize(name, parentName, applyMap);

                    //Normalized name may be a plugin ID due to map config
                    //application in normalize. The map config values must
                    //already be normalized, so do not need to redo that part.
                    nameParts = splitPrefix(normalizedName);
                    prefix = nameParts[0];
                    normalizedName = nameParts[1];
                    isNormalized = true;

                    url = context.nameToUrl(normalizedName);
                }
            }

            //If the id is a plugin id that cannot be determined if it needs
            //normalization, stamp it with a unique ID so two matching relative
            //ids that may conflict can be separate.
            suffix = prefix && !pluginModule && !isNormalized ?
                     '_unnormalized' + (unnormalizedCounter += 1) :
                     '';

            return {
                prefix: prefix,
                name: normalizedName,
                parentMap: parentModuleMap,
                unnormalized: !!suffix,
                url: url,
                originalName: originalName,
                isDefine: isDefine,
                id: (prefix ?
                        prefix + '!' + normalizedName :
                        normalizedName) + suffix
            };
        }

        function getModule(depMap) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (!mod) {
                mod = registry[id] = new context.Module(depMap);
            }

            return mod;
        }

        function on(depMap, name, fn) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (hasProp(defined, id) &&
                    (!mod || mod.defineEmitComplete)) {
                if (name === 'defined') {
                    fn(defined[id]);
                }
            } else {
                mod = getModule(depMap);
                if (mod.error && name === 'error') {
                    fn(mod.error);
                } else {
                    mod.on(name, fn);
                }
            }
        }

        function onError(err, errback) {
            var ids = err.requireModules,
                notified = false;

            if (errback) {
                errback(err);
            } else {
                each(ids, function (id) {
                    var mod = getOwn(registry, id);
                    if (mod) {
                        //Set error on module, so it skips timeout checks.
                        mod.error = err;
                        if (mod.events.error) {
                            notified = true;
                            mod.emit('error', err);
                        }
                    }
                });

                if (!notified) {
                    req.onError(err);
                }
            }
        }

        /**
         * Internal method to transfer globalQueue items to this context's
         * defQueue.
         */
        function takeGlobalQueue() {
            //Push all the globalDefQueue items into the context's defQueue
            if (globalDefQueue.length) {
                //Array splice in the values since the context code has a
                //local var ref to defQueue, so cannot just reassign the one
                //on context.
                apsp.apply(defQueue,
                           [defQueue.length, 0].concat(globalDefQueue));
                globalDefQueue = [];
            }
        }

        handlers = {
            'require': function (mod) {
                if (mod.require) {
                    return mod.require;
                } else {
                    return (mod.require = context.makeRequire(mod.map));
                }
            },
            'exports': function (mod) {
                mod.usingExports = true;
                if (mod.map.isDefine) {
                    if (mod.exports) {
                        return (defined[mod.map.id] = mod.exports);
                    } else {
                        return (mod.exports = defined[mod.map.id] = {});
                    }
                }
            },
            'module': function (mod) {
                if (mod.module) {
                    return mod.module;
                } else {
                    return (mod.module = {
                        id: mod.map.id,
                        uri: mod.map.url,
                        config: function () {
                            return  getOwn(config.config, mod.map.id) || {};
                        },
                        exports: mod.exports || (mod.exports = {})
                    });
                }
            }
        };

        function cleanRegistry(id) {
            //Clean up machinery used for waiting modules.
            delete registry[id];
            delete enabledRegistry[id];
        }

        function breakCycle(mod, traced, processed) {
            var id = mod.map.id;

            if (mod.error) {
                mod.emit('error', mod.error);
            } else {
                traced[id] = true;
                each(mod.depMaps, function (depMap, i) {
                    var depId = depMap.id,
                        dep = getOwn(registry, depId);

                    //Only force things that have not completed
                    //being defined, so still in the registry,
                    //and only if it has not been matched up
                    //in the module already.
                    if (dep && !mod.depMatched[i] && !processed[depId]) {
                        if (getOwn(traced, depId)) {
                            mod.defineDep(i, defined[depId]);
                            mod.check(); //pass false?
                        } else {
                            breakCycle(dep, traced, processed);
                        }
                    }
                });
                processed[id] = true;
            }
        }

        function checkLoaded() {
            var err, usingPathFallback,
                waitInterval = config.waitSeconds * 1000,
                //It is possible to disable the wait interval by using waitSeconds of 0.
                expired = waitInterval && (context.startTime + waitInterval) < new Date().getTime(),
                noLoads = [],
                reqCalls = [],
                stillLoading = false,
                needCycleCheck = true;

            //Do not bother if this call was a result of a cycle break.
            if (inCheckLoaded) {
                return;
            }

            inCheckLoaded = true;

            //Figure out the state of all the modules.
            eachProp(enabledRegistry, function (mod) {
                var map = mod.map,
                    modId = map.id;

                //Skip things that are not enabled or in error state.
                if (!mod.enabled) {
                    return;
                }

                if (!map.isDefine) {
                    reqCalls.push(mod);
                }

                if (!mod.error) {
                    //If the module should be executed, and it has not
                    //been inited and time is up, remember it.
                    if (!mod.inited && expired) {
                        if (hasPathFallback(modId)) {
                            usingPathFallback = true;
                            stillLoading = true;
                        } else {
                            noLoads.push(modId);
                            removeScript(modId);
                        }
                    } else if (!mod.inited && mod.fetched && map.isDefine) {
                        stillLoading = true;
                        if (!map.prefix) {
                            //No reason to keep looking for unfinished
                            //loading. If the only stillLoading is a
                            //plugin resource though, keep going,
                            //because it may be that a plugin resource
                            //is waiting on a non-plugin cycle.
                            return (needCycleCheck = false);
                        }
                    }
                }
            });

            if (expired && noLoads.length) {
                //If wait time expired, throw error of unloaded modules.
                err = makeError('timeout', 'Load timeout for modules: ' + noLoads, null, noLoads);
                err.contextName = context.contextName;
                return onError(err);
            }

            //Not expired, check for a cycle.
            if (needCycleCheck) {
                each(reqCalls, function (mod) {
                    breakCycle(mod, {}, {});
                });
            }

            //If still waiting on loads, and the waiting load is something
            //other than a plugin resource, or there are still outstanding
            //scripts, then just try back later.
            if ((!expired || usingPathFallback) && stillLoading) {
                //Something is still waiting to load. Wait for it, but only
                //if a timeout is not already in effect.
                if ((isBrowser || isWebWorker) && !checkLoadedTimeoutId) {
                    checkLoadedTimeoutId = setTimeout(function () {
                        checkLoadedTimeoutId = 0;
                        checkLoaded();
                    }, 50);
                }
            }

            inCheckLoaded = false;
        }

        Module = function (map) {
            this.events = getOwn(undefEvents, map.id) || {};
            this.map = map;
            this.shim = getOwn(config.shim, map.id);
            this.depExports = [];
            this.depMaps = [];
            this.depMatched = [];
            this.pluginMaps = {};
            this.depCount = 0;

            /* this.exports this.factory
               this.depMaps = [],
               this.enabled, this.fetched
            */
        };

        Module.prototype = {
            init: function (depMaps, factory, errback, options) {
                options = options || {};

                //Do not do more inits if already done. Can happen if there
                //are multiple define calls for the same module. That is not
                //a normal, common case, but it is also not unexpected.
                if (this.inited) {
                    return;
                }

                this.factory = factory;

                if (errback) {
                    //Register for errors on this module.
                    this.on('error', errback);
                } else if (this.events.error) {
                    //If no errback already, but there are error listeners
                    //on this module, set up an errback to pass to the deps.
                    errback = bind(this, function (err) {
                        this.emit('error', err);
                    });
                }

                //Do a copy of the dependency array, so that
                //source inputs are not modified. For example
                //"shim" deps are passed in here directly, and
                //doing a direct modification of the depMaps array
                //would affect that config.
                this.depMaps = depMaps && depMaps.slice(0);

                this.errback = errback;

                //Indicate this module has be initialized
                this.inited = true;

                this.ignore = options.ignore;

                //Could have option to init this module in enabled mode,
                //or could have been previously marked as enabled. However,
                //the dependencies are not known until init is called. So
                //if enabled previously, now trigger dependencies as enabled.
                if (options.enabled || this.enabled) {
                    //Enable this module and dependencies.
                    //Will call this.check()
                    this.enable();
                } else {
                    this.check();
                }
            },

            defineDep: function (i, depExports) {
                //Because of cycles, defined callback for a given
                //export can be called more than once.
                if (!this.depMatched[i]) {
                    this.depMatched[i] = true;
                    this.depCount -= 1;
                    this.depExports[i] = depExports;
                }
            },

            fetch: function () {
                if (this.fetched) {
                    return;
                }
                this.fetched = true;

                context.startTime = (new Date()).getTime();

                var map = this.map;

                //If the manager is for a plugin managed resource,
                //ask the plugin to load it now.
                if (this.shim) {
                    context.makeRequire(this.map, {
                        enableBuildCallback: true
                    })(this.shim.deps || [], bind(this, function () {
                        return map.prefix ? this.callPlugin() : this.load();
                    }));
                } else {
                    //Regular dependency.
                    return map.prefix ? this.callPlugin() : this.load();
                }
            },

            load: function () {
                var url = this.map.url;

                //Regular dependency.
                if (!urlFetched[url]) {
                    urlFetched[url] = true;
                    context.load(this.map.id, url);
                }
            },

            /**
             * Checks if the module is ready to define itself, and if so,
             * define it.
             */
            check: function () {
                if (!this.enabled || this.enabling) {
                    return;
                }

                var err, cjsModule,
                    id = this.map.id,
                    depExports = this.depExports,
                    exports = this.exports,
                    factory = this.factory;

                if (!this.inited) {
                    this.fetch();
                } else if (this.error) {
                    this.emit('error', this.error);
                } else if (!this.defining) {
                    //The factory could trigger another require call
                    //that would result in checking this module to
                    //define itself again. If already in the process
                    //of doing that, skip this work.
                    this.defining = true;

                    if (this.depCount < 1 && !this.defined) {
                        if (isFunction(factory)) {
                            //If there is an error listener, favor passing
                            //to that instead of throwing an error. However,
                            //only do it for define()'d  modules. require
                            //errbacks should not be called for failures in
                            //their callbacks (#699). However if a global
                            //onError is set, use that.
                            if ((this.events.error && this.map.isDefine) ||
                                req.onError !== defaultOnError) {
                                try {
                                    exports = context.execCb(id, factory, depExports, exports);
                                } catch (e) {
                                    err = e;
                                }
                            } else {
                                exports = context.execCb(id, factory, depExports, exports);
                            }

                            // Favor return value over exports. If node/cjs in play,
                            // then will not have a return value anyway. Favor
                            // module.exports assignment over exports object.
                            if (this.map.isDefine && exports === undefined) {
                                cjsModule = this.module;
                                if (cjsModule) {
                                    exports = cjsModule.exports;
                                } else if (this.usingExports) {
                                    //exports already set the defined value.
                                    exports = this.exports;
                                }
                            }

                            if (err) {
                                err.requireMap = this.map;
                                err.requireModules = this.map.isDefine ? [this.map.id] : null;
                                err.requireType = this.map.isDefine ? 'define' : 'require';
                                return onError((this.error = err));
                            }

                        } else {
                            //Just a literal value
                            exports = factory;
                        }

                        this.exports = exports;

                        if (this.map.isDefine && !this.ignore) {
                            defined[id] = exports;

                            if (req.onResourceLoad) {
                                req.onResourceLoad(context, this.map, this.depMaps);
                            }
                        }

                        //Clean up
                        cleanRegistry(id);

                        this.defined = true;
                    }

                    //Finished the define stage. Allow calling check again
                    //to allow define notifications below in the case of a
                    //cycle.
                    this.defining = false;

                    if (this.defined && !this.defineEmitted) {
                        this.defineEmitted = true;
                        this.emit('defined', this.exports);
                        this.defineEmitComplete = true;
                    }

                }
            },

            callPlugin: function () {
                var map = this.map,
                    id = map.id,
                    //Map already normalized the prefix.
                    pluginMap = makeModuleMap(map.prefix);

                //Mark this as a dependency for this plugin, so it
                //can be traced for cycles.
                this.depMaps.push(pluginMap);

                on(pluginMap, 'defined', bind(this, function (plugin) {
                    var load, normalizedMap, normalizedMod,
                        bundleId = getOwn(bundlesMap, this.map.id),
                        name = this.map.name,
                        parentName = this.map.parentMap ? this.map.parentMap.name : null,
                        localRequire = context.makeRequire(map.parentMap, {
                            enableBuildCallback: true
                        });

                    //If current map is not normalized, wait for that
                    //normalized name to load instead of continuing.
                    if (this.map.unnormalized) {
                        //Normalize the ID if the plugin allows it.
                        if (plugin.normalize) {
                            name = plugin.normalize(name, function (name) {
                                return normalize(name, parentName, true);
                            }) || '';
                        }

                        //prefix and name should already be normalized, no need
                        //for applying map config again either.
                        normalizedMap = makeModuleMap(map.prefix + '!' + name,
                                                      this.map.parentMap);
                        on(normalizedMap,
                            'defined', bind(this, function (value) {
                                this.init([], function () { return value; }, null, {
                                    enabled: true,
                                    ignore: true
                                });
                            }));

                        normalizedMod = getOwn(registry, normalizedMap.id);
                        if (normalizedMod) {
                            //Mark this as a dependency for this plugin, so it
                            //can be traced for cycles.
                            this.depMaps.push(normalizedMap);

                            if (this.events.error) {
                                normalizedMod.on('error', bind(this, function (err) {
                                    this.emit('error', err);
                                }));
                            }
                            normalizedMod.enable();
                        }

                        return;
                    }

                    //If a paths config, then just load that file instead to
                    //resolve the plugin, as it is built into that paths layer.
                    if (bundleId) {
                        this.map.url = context.nameToUrl(bundleId);
                        this.load();
                        return;
                    }

                    load = bind(this, function (value) {
                        this.init([], function () { return value; }, null, {
                            enabled: true
                        });
                    });

                    load.error = bind(this, function (err) {
                        this.inited = true;
                        this.error = err;
                        err.requireModules = [id];

                        //Remove temp unnormalized modules for this module,
                        //since they will never be resolved otherwise now.
                        eachProp(registry, function (mod) {
                            if (mod.map.id.indexOf(id + '_unnormalized') === 0) {
                                cleanRegistry(mod.map.id);
                            }
                        });

                        onError(err);
                    });

                    //Allow plugins to load other code without having to know the
                    //context or how to 'complete' the load.
                    load.fromText = bind(this, function (text, textAlt) {
                        /*jslint evil: true */
                        var moduleName = map.name,
                            moduleMap = makeModuleMap(moduleName),
                            hasInteractive = useInteractive;

                        //As of 2.1.0, support just passing the text, to reinforce
                        //fromText only being called once per resource. Still
                        //support old style of passing moduleName but discard
                        //that moduleName in favor of the internal ref.
                        if (textAlt) {
                            text = textAlt;
                        }

                        //Turn off interactive script matching for IE for any define
                        //calls in the text, then turn it back on at the end.
                        if (hasInteractive) {
                            useInteractive = false;
                        }

                        //Prime the system by creating a module instance for
                        //it.
                        getModule(moduleMap);

                        //Transfer any config to this other module.
                        if (hasProp(config.config, id)) {
                            config.config[moduleName] = config.config[id];
                        }

                        try {
                            req.exec(text);
                        } catch (e) {
                            return onError(makeError('fromtexteval',
                                             'fromText eval for ' + id +
                                            ' failed: ' + e,
                                             e,
                                             [id]));
                        }

                        if (hasInteractive) {
                            useInteractive = true;
                        }

                        //Mark this as a dependency for the plugin
                        //resource
                        this.depMaps.push(moduleMap);

                        //Support anonymous modules.
                        context.completeLoad(moduleName);

                        //Bind the value of that module to the value for this
                        //resource ID.
                        localRequire([moduleName], load);
                    });

                    //Use parentName here since the plugin's name is not reliable,
                    //could be some weird string with no path that actually wants to
                    //reference the parentName's path.
                    plugin.load(map.name, localRequire, load, config);
                }));

                context.enable(pluginMap, this);
                this.pluginMaps[pluginMap.id] = pluginMap;
            },

            enable: function () {
                enabledRegistry[this.map.id] = this;
                this.enabled = true;

                //Set flag mentioning that the module is enabling,
                //so that immediate calls to the defined callbacks
                //for dependencies do not trigger inadvertent load
                //with the depCount still being zero.
                this.enabling = true;

                //Enable each dependency
                each(this.depMaps, bind(this, function (depMap, i) {
                    var id, mod, handler;

                    if (typeof depMap === 'string') {
                        //Dependency needs to be converted to a depMap
                        //and wired up to this module.
                        depMap = makeModuleMap(depMap,
                                               (this.map.isDefine ? this.map : this.map.parentMap),
                                               false,
                                               !this.skipMap);
                        this.depMaps[i] = depMap;

                        handler = getOwn(handlers, depMap.id);

                        if (handler) {
                            this.depExports[i] = handler(this);
                            return;
                        }

                        this.depCount += 1;

                        on(depMap, 'defined', bind(this, function (depExports) {
                            this.defineDep(i, depExports);
                            this.check();
                        }));

                        if (this.errback) {
                            on(depMap, 'error', bind(this, this.errback));
                        } else if (this.events.error) {
                            // No direct errback on this module, but something
                            // else is listening for errors, so be sure to
                            // propagate the error correctly.
                            on(depMap, 'error', bind(this, function(err) {
                                this.emit('error', err);
                            }));
                        }
                    }

                    id = depMap.id;
                    mod = registry[id];

                    //Skip special modules like 'require', 'exports', 'module'
                    //Also, don't call enable if it is already enabled,
                    //important in circular dependency cases.
                    if (!hasProp(handlers, id) && mod && !mod.enabled) {
                        context.enable(depMap, this);
                    }
                }));

                //Enable each plugin that is used in
                //a dependency
                eachProp(this.pluginMaps, bind(this, function (pluginMap) {
                    var mod = getOwn(registry, pluginMap.id);
                    if (mod && !mod.enabled) {
                        context.enable(pluginMap, this);
                    }
                }));

                this.enabling = false;

                this.check();
            },

            on: function (name, cb) {
                var cbs = this.events[name];
                if (!cbs) {
                    cbs = this.events[name] = [];
                }
                cbs.push(cb);
            },

            emit: function (name, evt) {
                each(this.events[name], function (cb) {
                    cb(evt);
                });
                if (name === 'error') {
                    //Now that the error handler was triggered, remove
                    //the listeners, since this broken Module instance
                    //can stay around for a while in the registry.
                    delete this.events[name];
                }
            }
        };

        function callGetModule(args) {
            //Skip modules already defined.
            if (!hasProp(defined, args[0])) {
                getModule(makeModuleMap(args[0], null, true)).init(args[1], args[2]);
            }
        }

        function removeListener(node, func, name, ieName) {
            //Favor detachEvent because of IE9
            //issue, see attachEvent/addEventListener comment elsewhere
            //in this file.
            if (node.detachEvent && !isOpera) {
                //Probably IE. If not it will throw an error, which will be
                //useful to know.
                if (ieName) {
                    node.detachEvent(ieName, func);
                }
            } else {
                node.removeEventListener(name, func, false);
            }
        }

        /**
         * Given an event from a script node, get the requirejs info from it,
         * and then removes the event listeners on the node.
         * @param {Event} evt
         * @returns {Object}
         */
        function getScriptData(evt) {
            //Using currentTarget instead of target for Firefox 2.0's sake. Not
            //all old browsers will be supported, but this one was easy enough
            //to support and still makes sense.
            var node = evt.currentTarget || evt.srcElement;

            //Remove the listeners once here.
            removeListener(node, context.onScriptLoad, 'load', 'onreadystatechange');
            removeListener(node, context.onScriptError, 'error');

            return {
                node: node,
                id: node && node.getAttribute('data-requiremodule')
            };
        }

        function intakeDefines() {
            var args;

            //Any defined modules in the global queue, intake them now.
            takeGlobalQueue();

            //Make sure any remaining defQueue items get properly processed.
            while (defQueue.length) {
                args = defQueue.shift();
                if (args[0] === null) {
                    return onError(makeError('mismatch', 'Mismatched anonymous define() module: ' + args[args.length - 1]));
                } else {
                    //args are id, deps, factory. Should be normalized by the
                    //define() function.
                    callGetModule(args);
                }
            }
        }

        context = {
            config: config,
            contextName: contextName,
            registry: registry,
            defined: defined,
            urlFetched: urlFetched,
            defQueue: defQueue,
            Module: Module,
            makeModuleMap: makeModuleMap,
            nextTick: req.nextTick,
            onError: onError,

            /**
             * Set a configuration for the context.
             * @param {Object} cfg config object to integrate.
             */
            configure: function (cfg) {
                //Make sure the baseUrl ends in a slash.
                if (cfg.baseUrl) {
                    if (cfg.baseUrl.charAt(cfg.baseUrl.length - 1) !== '/') {
                        cfg.baseUrl += '/';
                    }
                }

                //Save off the paths since they require special processing,
                //they are additive.
                var shim = config.shim,
                    objs = {
                        paths: true,
                        bundles: true,
                        config: true,
                        map: true
                    };

                eachProp(cfg, function (value, prop) {
                    if (objs[prop]) {
                        if (!config[prop]) {
                            config[prop] = {};
                        }
                        mixin(config[prop], value, true, true);
                    } else {
                        config[prop] = value;
                    }
                });

                //Reverse map the bundles
                if (cfg.bundles) {
                    eachProp(cfg.bundles, function (value, prop) {
                        each(value, function (v) {
                            if (v !== prop) {
                                bundlesMap[v] = prop;
                            }
                        });
                    });
                }

                //Merge shim
                if (cfg.shim) {
                    eachProp(cfg.shim, function (value, id) {
                        //Normalize the structure
                        if (isArray(value)) {
                            value = {
                                deps: value
                            };
                        }
                        if ((value.exports || value.init) && !value.exportsFn) {
                            value.exportsFn = context.makeShimExports(value);
                        }
                        shim[id] = value;
                    });
                    config.shim = shim;
                }

                //Adjust packages if necessary.
                if (cfg.packages) {
                    each(cfg.packages, function (pkgObj) {
                        var location, name;

                        pkgObj = typeof pkgObj === 'string' ? { name: pkgObj } : pkgObj;

                        name = pkgObj.name;
                        location = pkgObj.location;
                        if (location) {
                            config.paths[name] = pkgObj.location;
                        }

                        //Save pointer to main module ID for pkg name.
                        //Remove leading dot in main, so main paths are normalized,
                        //and remove any trailing .js, since different package
                        //envs have different conventions: some use a module name,
                        //some use a file name.
                        config.pkgs[name] = pkgObj.name + '/' + (pkgObj.main || 'main')
                                     .replace(currDirRegExp, '')
                                     .replace(jsSuffixRegExp, '');
                    });
                }

                //If there are any "waiting to execute" modules in the registry,
                //update the maps for them, since their info, like URLs to load,
                //may have changed.
                eachProp(registry, function (mod, id) {
                    //If module already has init called, since it is too
                    //late to modify them, and ignore unnormalized ones
                    //since they are transient.
                    if (!mod.inited && !mod.map.unnormalized) {
                        mod.map = makeModuleMap(id);
                    }
                });

                //If a deps array or a config callback is specified, then call
                //require with those args. This is useful when require is defined as a
                //config object before require.js is loaded.
                if (cfg.deps || cfg.callback) {
                    context.require(cfg.deps || [], cfg.callback);
                }
            },

            makeShimExports: function (value) {
                function fn() {
                    var ret;
                    if (value.init) {
                        ret = value.init.apply(global, arguments);
                    }
                    return ret || (value.exports && getGlobal(value.exports));
                }
                return fn;
            },

            makeRequire: function (relMap, options) {
                options = options || {};

                function localRequire(deps, callback, errback) {
                    var id, map, requireMod;

                    if (options.enableBuildCallback && callback && isFunction(callback)) {
                        callback.__requireJsBuild = true;
                    }

                    if (typeof deps === 'string') {
                        if (isFunction(callback)) {
                            //Invalid call
                            return onError(makeError('requireargs', 'Invalid require call'), errback);
                        }

                        //If require|exports|module are requested, get the
                        //value for them from the special handlers. Caveat:
                        //this only works while module is being defined.
                        if (relMap && hasProp(handlers, deps)) {
                            return handlers[deps](registry[relMap.id]);
                        }

                        //Synchronous access to one module. If require.get is
                        //available (as in the Node adapter), prefer that.
                        if (req.get) {
                            return req.get(context, deps, relMap, localRequire);
                        }

                        //Normalize module name, if it contains . or ..
                        map = makeModuleMap(deps, relMap, false, true);
                        id = map.id;

                        if (!hasProp(defined, id)) {
                            return onError(makeError('notloaded', 'Module name "' +
                                        id +
                                        '" has not been loaded yet for context: ' +
                                        contextName +
                                        (relMap ? '' : '. Use require([])')));
                        }
                        return defined[id];
                    }

                    //Grab defines waiting in the global queue.
                    intakeDefines();

                    //Mark all the dependencies as needing to be loaded.
                    context.nextTick(function () {
                        //Some defines could have been added since the
                        //require call, collect them.
                        intakeDefines();

                        requireMod = getModule(makeModuleMap(null, relMap));

                        //Store if map config should be applied to this require
                        //call for dependencies.
                        requireMod.skipMap = options.skipMap;

                        requireMod.init(deps, callback, errback, {
                            enabled: true
                        });

                        checkLoaded();
                    });

                    return localRequire;
                }

                mixin(localRequire, {
                    isBrowser: isBrowser,

                    /**
                     * Converts a module name + .extension into an URL path.
                     * *Requires* the use of a module name. It does not support using
                     * plain URLs like nameToUrl.
                     */
                    toUrl: function (moduleNamePlusExt) {
                        var ext,
                            index = moduleNamePlusExt.lastIndexOf('.'),
                            segment = moduleNamePlusExt.split('/')[0],
                            isRelative = segment === '.' || segment === '..';

                        //Have a file extension alias, and it is not the
                        //dots from a relative path.
                        if (index !== -1 && (!isRelative || index > 1)) {
                            ext = moduleNamePlusExt.substring(index, moduleNamePlusExt.length);
                            moduleNamePlusExt = moduleNamePlusExt.substring(0, index);
                        }

                        return context.nameToUrl(normalize(moduleNamePlusExt,
                                                relMap && relMap.id, true), ext,  true);
                    },

                    defined: function (id) {
                        return hasProp(defined, makeModuleMap(id, relMap, false, true).id);
                    },

                    specified: function (id) {
                        id = makeModuleMap(id, relMap, false, true).id;
                        return hasProp(defined, id) || hasProp(registry, id);
                    }
                });

                //Only allow undef on top level require calls
                if (!relMap) {
                    localRequire.undef = function (id) {
                        //Bind any waiting define() calls to this context,
                        //fix for #408
                        takeGlobalQueue();

                        var map = makeModuleMap(id, relMap, true),
                            mod = getOwn(registry, id);

                        removeScript(id);

                        delete defined[id];
                        delete urlFetched[map.url];
                        delete undefEvents[id];

                        //Clean queued defines too. Go backwards
                        //in array so that the splices do not
                        //mess up the iteration.
                        eachReverse(defQueue, function(args, i) {
                            if(args[0] === id) {
                                defQueue.splice(i, 1);
                            }
                        });

                        if (mod) {
                            //Hold on to listeners in case the
                            //module will be attempted to be reloaded
                            //using a different config.
                            if (mod.events.defined) {
                                undefEvents[id] = mod.events;
                            }

                            cleanRegistry(id);
                        }
                    };
                }

                return localRequire;
            },

            /**
             * Called to enable a module if it is still in the registry
             * awaiting enablement. A second arg, parent, the parent module,
             * is passed in for context, when this method is overridden by
             * the optimizer. Not shown here to keep code compact.
             */
            enable: function (depMap) {
                var mod = getOwn(registry, depMap.id);
                if (mod) {
                    getModule(depMap).enable();
                }
            },

            /**
             * Internal method used by environment adapters to complete a load event.
             * A load event could be a script load or just a load pass from a synchronous
             * load call.
             * @param {String} moduleName the name of the module to potentially complete.
             */
            completeLoad: function (moduleName) {
                var found, args, mod,
                    shim = getOwn(config.shim, moduleName) || {},
                    shExports = shim.exports;

                takeGlobalQueue();

                while (defQueue.length) {
                    args = defQueue.shift();
                    if (args[0] === null) {
                        args[0] = moduleName;
                        //If already found an anonymous module and bound it
                        //to this name, then this is some other anon module
                        //waiting for its completeLoad to fire.
                        if (found) {
                            break;
                        }
                        found = true;
                    } else if (args[0] === moduleName) {
                        //Found matching define call for this script!
                        found = true;
                    }

                    callGetModule(args);
                }

                //Do this after the cycle of callGetModule in case the result
                //of those calls/init calls changes the registry.
                mod = getOwn(registry, moduleName);

                if (!found && !hasProp(defined, moduleName) && mod && !mod.inited) {
                    if (config.enforceDefine && (!shExports || !getGlobal(shExports))) {
                        if (hasPathFallback(moduleName)) {
                            return;
                        } else {
                            return onError(makeError('nodefine',
                                             'No define call for ' + moduleName,
                                             null,
                                             [moduleName]));
                        }
                    } else {
                        //A script that does not call define(), so just simulate
                        //the call for it.
                        callGetModule([moduleName, (shim.deps || []), shim.exportsFn]);
                    }
                }

                checkLoaded();
            },

            /**
             * Converts a module name to a file path. Supports cases where
             * moduleName may actually be just an URL.
             * Note that it **does not** call normalize on the moduleName,
             * it is assumed to have already been normalized. This is an
             * internal API, not a public one. Use toUrl for the public API.
             */
            nameToUrl: function (moduleName, ext, skipExt) {
                var paths, syms, i, parentModule, url,
                    parentPath, bundleId,
                    pkgMain = getOwn(config.pkgs, moduleName);

                if (pkgMain) {
                    moduleName = pkgMain;
                }

                bundleId = getOwn(bundlesMap, moduleName);

                if (bundleId) {
                    return context.nameToUrl(bundleId, ext, skipExt);
                }

                //If a colon is in the URL, it indicates a protocol is used and it is just
                //an URL to a file, or if it starts with a slash, contains a query arg (i.e. ?)
                //or ends with .js, then assume the user meant to use an url and not a module id.
                //The slash is important for protocol-less URLs as well as full paths.
                if (req.jsExtRegExp.test(moduleName)) {
                    //Just a plain path, not module name lookup, so just return it.
                    //Add extension if it is included. This is a bit wonky, only non-.js things pass
                    //an extension, this method probably needs to be reworked.
                    url = moduleName + (ext || '');
                } else {
                    //A module that needs to be converted to a path.
                    paths = config.paths;

                    syms = moduleName.split('/');
                    //For each module name segment, see if there is a path
                    //registered for it. Start with most specific name
                    //and work up from it.
                    for (i = syms.length; i > 0; i -= 1) {
                        parentModule = syms.slice(0, i).join('/');

                        parentPath = getOwn(paths, parentModule);
                        if (parentPath) {
                            //If an array, it means there are a few choices,
                            //Choose the one that is desired
                            if (isArray(parentPath)) {
                                parentPath = parentPath[0];
                            }
                            syms.splice(0, i, parentPath);
                            break;
                        }
                    }

                    //Join the path parts together, then figure out if baseUrl is needed.
                    url = syms.join('/');
                    url += (ext || (/^data\:|\?/.test(url) || skipExt ? '' : '.js'));
                    url = (url.charAt(0) === '/' || url.match(/^[\w\+\.\-]+:/) ? '' : config.baseUrl) + url;
                }

                return config.urlArgs ? url +
                                        ((url.indexOf('?') === -1 ? '?' : '&') +
                                         config.urlArgs) : url;
            },

            //Delegates to req.load. Broken out as a separate function to
            //allow overriding in the optimizer.
            load: function (id, url) {
                req.load(context, id, url);
            },

            /**
             * Executes a module callback function. Broken out as a separate function
             * solely to allow the build system to sequence the files in the built
             * layer in the right sequence.
             *
             * @private
             */
            execCb: function (name, callback, args, exports) {
                return callback.apply(exports, args);
            },

            /**
             * callback for script loads, used to check status of loading.
             *
             * @param {Event} evt the event from the browser for the script
             * that was loaded.
             */
            onScriptLoad: function (evt) {
                //Using currentTarget instead of target for Firefox 2.0's sake. Not
                //all old browsers will be supported, but this one was easy enough
                //to support and still makes sense.
                if (evt.type === 'load' ||
                        (readyRegExp.test((evt.currentTarget || evt.srcElement).readyState))) {
                    //Reset interactive script so a script node is not held onto for
                    //to long.
                    interactiveScript = null;

                    //Pull out the name of the module and the context.
                    var data = getScriptData(evt);
                    context.completeLoad(data.id);
                }
            },

            /**
             * Callback for script errors.
             */
            onScriptError: function (evt) {
                var data = getScriptData(evt);
                if (!hasPathFallback(data.id)) {
                    return onError(makeError('scripterror', 'Script error for: ' + data.id, evt, [data.id]));
                }
            }
        };

        context.require = context.makeRequire();
        return context;
    }

    /**
     * Main entry point.
     *
     * If the only argument to require is a string, then the module that
     * is represented by that string is fetched for the appropriate context.
     *
     * If the first argument is an array, then it will be treated as an array
     * of dependency string names to fetch. An optional function callback can
     * be specified to execute when all of those dependencies are available.
     *
     * Make a local req variable to help Caja compliance (it assumes things
     * on a require that are not standardized), and to give a short
     * name for minification/local scope use.
     */
    req = requirejs = function (deps, callback, errback, optional) {

        //Find the right context, use default
        var context, config,
            contextName = defContextName;

        // Determine if have config object in the call.
        if (!isArray(deps) && typeof deps !== 'string') {
            // deps is a config object
            config = deps;
            if (isArray(callback)) {
                // Adjust args if there are dependencies
                deps = callback;
                callback = errback;
                errback = optional;
            } else {
                deps = [];
            }
        }

        if (config && config.context) {
            contextName = config.context;
        }

        context = getOwn(contexts, contextName);
        if (!context) {
            context = contexts[contextName] = req.s.newContext(contextName);
        }

        if (config) {
            context.configure(config);
        }

        return context.require(deps, callback, errback);
    };

    /**
     * Support require.config() to make it easier to cooperate with other
     * AMD loaders on globally agreed names.
     */
    req.config = function (config) {
        return req(config);
    };

    /**
     * Execute something after the current tick
     * of the event loop. Override for other envs
     * that have a better solution than setTimeout.
     * @param  {Function} fn function to execute later.
     */
    req.nextTick = typeof setTimeout !== 'undefined' ? function (fn) {
        setTimeout(fn, 4);
    } : function (fn) { fn(); };

    /**
     * Export require as a global, but only if it does not already exist.
     */
    if (!require) {
        require = req;
    }

    req.version = version;

    //Used to filter out dependencies that are already paths.
    req.jsExtRegExp = /^\/|:|\?|\.js$/;
    req.isBrowser = isBrowser;
    s = req.s = {
        contexts: contexts,
        newContext: newContext
    };

    //Create default context.
    req({});

    //Exports some context-sensitive methods on global require.
    each([
        'toUrl',
        'undef',
        'defined',
        'specified'
    ], function (prop) {
        //Reference from contexts instead of early binding to default context,
        //so that during builds, the latest instance of the default context
        //with its config gets used.
        req[prop] = function () {
            var ctx = contexts[defContextName];
            return ctx.require[prop].apply(ctx, arguments);
        };
    });

    if (isBrowser) {
        head = s.head = document.getElementsByTagName('head')[0];
        //If BASE tag is in play, using appendChild is a problem for IE6.
        //When that browser dies, this can be removed. Details in this jQuery bug:
        //http://dev.jquery.com/ticket/2709
        baseElement = document.getElementsByTagName('base')[0];
        if (baseElement) {
            head = s.head = baseElement.parentNode;
        }
    }

    /**
     * Any errors that require explicitly generates will be passed to this
     * function. Intercept/override it if you want custom error handling.
     * @param {Error} err the error object.
     */
    req.onError = defaultOnError;

    /**
     * Creates the node for the load command. Only used in browser envs.
     */
    req.createNode = function (config, moduleName, url) {
        var node = config.xhtml ?
                document.createElementNS('http://www.w3.org/1999/xhtml', 'html:script') :
                document.createElement('script');
        node.type = config.scriptType || 'text/javascript';
        node.charset = 'utf-8';
        node.async = true;
        return node;
    };

    /**
     * Does the request to load a module for the browser case.
     * Make this a separate function to allow other environments
     * to override it.
     *
     * @param {Object} context the require context to find state.
     * @param {String} moduleName the name of the module.
     * @param {Object} url the URL to the module.
     */
    req.load = function (context, moduleName, url) {
        var config = (context && context.config) || {},
            node;
        if (isBrowser) {
            //In the browser so use a script tag
            node = req.createNode(config, moduleName, url);

            node.setAttribute('data-requirecontext', context.contextName);
            node.setAttribute('data-requiremodule', moduleName);

            //Set up load listener. Test attachEvent first because IE9 has
            //a subtle issue in its addEventListener and script onload firings
            //that do not match the behavior of all other browsers with
            //addEventListener support, which fire the onload event for a
            //script right after the script execution. See:
            //https://connect.microsoft.com/IE/feedback/details/648057/script-onload-event-is-not-fired-immediately-after-script-execution
            //UNFORTUNATELY Opera implements attachEvent but does not follow the script
            //script execution mode.
            if (node.attachEvent &&
                    //Check if node.attachEvent is artificially added by custom script or
                    //natively supported by browser
                    //read https://github.com/jrburke/requirejs/issues/187
                    //if we can NOT find [native code] then it must NOT natively supported.
                    //in IE8, node.attachEvent does not have toString()
                    //Note the test for "[native code" with no closing brace, see:
                    //https://github.com/jrburke/requirejs/issues/273
                    !(node.attachEvent.toString && node.attachEvent.toString().indexOf('[native code') < 0) &&
                    !isOpera) {
                //Probably IE. IE (at least 6-8) do not fire
                //script onload right after executing the script, so
                //we cannot tie the anonymous define call to a name.
                //However, IE reports the script as being in 'interactive'
                //readyState at the time of the define call.
                useInteractive = true;

                node.attachEvent('onreadystatechange', context.onScriptLoad);
                //It would be great to add an error handler here to catch
                //404s in IE9+. However, onreadystatechange will fire before
                //the error handler, so that does not help. If addEventListener
                //is used, then IE will fire error before load, but we cannot
                //use that pathway given the connect.microsoft.com issue
                //mentioned above about not doing the 'script execute,
                //then fire the script load event listener before execute
                //next script' that other browsers do.
                //Best hope: IE10 fixes the issues,
                //and then destroys all installs of IE 6-9.
                //node.attachEvent('onerror', context.onScriptError);
            } else {
                node.addEventListener('load', context.onScriptLoad, false);
                node.addEventListener('error', context.onScriptError, false);
            }
            node.src = url;

            //For some cache cases in IE 6-8, the script executes before the end
            //of the appendChild execution, so to tie an anonymous define
            //call to the module name (which is stored on the node), hold on
            //to a reference to this node, but clear after the DOM insertion.
            currentlyAddingScript = node;
            if (baseElement) {
                head.insertBefore(node, baseElement);
            } else {
                head.appendChild(node);
            }
            currentlyAddingScript = null;

            return node;
        } else if (isWebWorker) {
            try {
                //In a web worker, use importScripts. This is not a very
                //efficient use of importScripts, importScripts will block until
                //its script is downloaded and evaluated. However, if web workers
                //are in play, the expectation that a build has been done so that
                //only one script needs to be loaded anyway. This may need to be
                //reevaluated if other use cases become common.
                importScripts(url);

                //Account for anonymous modules
                context.completeLoad(moduleName);
            } catch (e) {
                context.onError(makeError('importscripts',
                                'importScripts failed for ' +
                                    moduleName + ' at ' + url,
                                e,
                                [moduleName]));
            }
        }
    };

    function getInteractiveScript() {
        if (interactiveScript && interactiveScript.readyState === 'interactive') {
            return interactiveScript;
        }

        eachReverse(scripts(), function (script) {
            if (script.readyState === 'interactive') {
                return (interactiveScript = script);
            }
        });
        return interactiveScript;
    }

    //Look for a data-main script attribute, which could also adjust the baseUrl.
    if (isBrowser && !cfg.skipDataMain) {
        //Figure out baseUrl. Get it from the script tag with require.js in it.
        eachReverse(scripts(), function (script) {
            //Set the 'head' where we can append children by
            //using the script's parent.
            if (!head) {
                head = script.parentNode;
            }

            //Look for a data-main attribute to set main script for the page
            //to load. If it is there, the path to data main becomes the
            //baseUrl, if it is not already set.
            dataMain = script.getAttribute('data-main');
            if (dataMain) {
                //Preserve dataMain in case it is a path (i.e. contains '?')
                mainScript = dataMain;

                //Set final baseUrl if there is not already an explicit one.
                if (!cfg.baseUrl) {
                    //Pull off the directory of data-main for use as the
                    //baseUrl.
                    src = mainScript.split('/');
                    mainScript = src.pop();
                    subPath = src.length ? src.join('/')  + '/' : './';

                    cfg.baseUrl = subPath;
                }

                //Strip off any trailing .js since mainScript is now
                //like a module name.
                mainScript = mainScript.replace(jsSuffixRegExp, '');

                 //If mainScript is still a path, fall back to dataMain
                if (req.jsExtRegExp.test(mainScript)) {
                    mainScript = dataMain;
                }

                //Put the data-main script in the files to load.
                cfg.deps = cfg.deps ? cfg.deps.concat(mainScript) : [mainScript];

                return true;
            }
        });
    }

    /**
     * The function that handles definitions of modules. Differs from
     * require() in that a string for the module should be the first argument,
     * and the function to execute after dependencies are loaded should
     * return a value to define the module corresponding to the first argument's
     * name.
     */
    define = function (name, deps, callback) {
        var node, context;

        //Allow for anonymous modules
        if (typeof name !== 'string') {
            //Adjust args appropriately
            callback = deps;
            deps = name;
            name = null;
        }

        //This module may not have dependencies
        if (!isArray(deps)) {
            callback = deps;
            deps = null;
        }

        //If no name, and callback is a function, then figure out if it a
        //CommonJS thing with dependencies.
        if (!deps && isFunction(callback)) {
            deps = [];
            //Remove comments from the callback string,
            //look for require calls, and pull them into the dependencies,
            //but only if there are function args.
            if (callback.length) {
                callback
                    .toString()
                    .replace(commentRegExp, '')
                    .replace(cjsRequireRegExp, function (match, dep) {
                        deps.push(dep);
                    });

                //May be a CommonJS thing even without require calls, but still
                //could use exports, and module. Avoid doing exports and module
                //work though if it just needs require.
                //REQUIRES the function to expect the CommonJS variables in the
                //order listed below.
                deps = (callback.length === 1 ? ['require'] : ['require', 'exports', 'module']).concat(deps);
            }
        }

        //If in IE 6-8 and hit an anonymous define() call, do the interactive
        //work.
        if (useInteractive) {
            node = currentlyAddingScript || getInteractiveScript();
            if (node) {
                if (!name) {
                    name = node.getAttribute('data-requiremodule');
                }
                context = contexts[node.getAttribute('data-requirecontext')];
            }
        }

        //Always save off evaluating the def call until the script onload handler.
        //This allows multiple modules to be in a file without prematurely
        //tracing dependencies, and allows for anonymous module support,
        //where the module name is not known until the script onload event
        //occurs. If no context, use the global queue, and get it processed
        //in the onscript load callback.
        (context ? context.defQueue : globalDefQueue).push([name, deps, callback]);
    };

    define.amd = {
        jQuery: true
    };


    /**
     * Executes the text. Normally just uses eval, but can be modified
     * to use a better, environment-specific call. Only used for transpiling
     * loader plugins, not for plain JS modules.
     * @param {String} text the text to execute/evaluate.
     */
    req.exec = function (text) {
        /*jslint evil: true */
        return eval(text);
    };

    //Set up with config info.
    req(cfg);
}(this));

define("../../bower_components/requirejs/require", function(){});

define('person',["exports", "module"], function (exports, module) {
	"use strict";

	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

	var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

	// Using a symbol here seems to ensure we have unique references per instance
	var HEIGHT = Symbol();

	var Person = (function () {
		function Person(name) {
			_classCallCheck(this, Person);

			this.name = name;

			// Using a symbol allows us to also keep the variable private but use the getters and setters outside of the constructor
			this[HEIGHT] = 0;

			// This allows us to use a private variable that is scoped internally.
			var __age = 0;

			Object.defineProperty(this, "age", {
				get: function get() {
					return __age;
				},
				set: function set(value) {
					return __age = value;
				}
			});
		}

		_createClass(Person, [{
			key: "height",
			get: function () {
				return this[HEIGHT];
			},
			set: function (value) {
				this[HEIGHT] = value;
			}
		}]);

		return Person;
	})();

	module.exports = Person;
});
//# sourceMappingURL=person.js.map;
define('employee',["exports", "module", "person"], function (exports, module, _person) {
	"use strict";

	var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

	var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

	var _Person2 = _interopRequire(_person);

	// this will not work properly across instances of Employee,
	// setting this on any instance will change it for all.

	// use of a Symbol here avoids this, see person.js
	var __salery = 15000;

	var Employee = (function (_Person) {
		function Employee(name) {
			_classCallCheck(this, Employee);

			_get(Object.getPrototypeOf(Employee.prototype), "constructor", this).call(this, name);
		}

		_inherits(Employee, _Person);

		_createClass(Employee, [{
			key: "salery",
			set: function (value) {
				__salery = value;
			},
			get: function () {
				return __salery;
			}
		}]);

		return Employee;
	})(_Person2);

	module.exports = Employee;
});
//# sourceMappingURL=employee.js.map;
define('manager',["exports", "module", "employee"], function (exports, module, _employee) {
	"use strict";

	var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

	var _Employee2 = _interopRequire(_employee);

	var Manager = (function (_Employee) {
		function Manager(name) {
			_classCallCheck(this, Manager);

			_get(Object.getPrototypeOf(Manager.prototype), "constructor", this).call(this, name);
		}

		_inherits(Manager, _Employee);

		return Manager;
	})(_Employee2);

	module.exports = Manager;
});
//# sourceMappingURL=manager.js.map;
define('main',["exports", "person", "employee", "manager", "require"], function (exports, _person, _employee, _manager, _require) {
  "use strict";

  var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

  var _Person = _interopRequire(_person);

  var _Employee = _interopRequire(_employee);

  var _Manager = _interopRequire(_manager);

  var _require2 = _interopRequire(_require);

  var me = new _Person("John Hornsby");

  var efan = new _Employee("Efan Hornsby");
  efan.age = 5;
  efan.height = 1.2;
  efan.salery = 15000;

  var wendy = new _Manager("Wendy Finnie");
  wendy.age = 53;
  wendy.height = 1.8;
  wendy.salery = 20000;

  console.log("" + wendy.name + " is " + wendy.age + " years old and is " + wendy.height + " tall and earns " + wendy.salery + "k");

  console.log(efan.name + " is " + efan.age + " years old and is " + efan.height + " tall and earns " + efan.salery + "k");
  console.log("Efans salery has the same reference as Wendys, however the height does not. Height uses Symbols");
});
//# sourceMappingURL=main.js.map;
(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){(function(global){"use strict";if(global._babelPolyfill){throw new Error("only one instance of babel/polyfill is allowed")}global._babelPolyfill=true;require("core-js/shim");require("regenerator/runtime")}).call(this,typeof global!=="undefined"?global:typeof self!=="undefined"?self:typeof window!=="undefined"?window:{})},{"core-js/shim":72,"regenerator/runtime":73}],2:[function(require,module,exports){"use strict";var $=require("./$");module.exports=function(IS_INCLUDES){return function(el){var O=$.toObject(this),length=$.toLength(O.length),index=$.toIndex(arguments[1],length),value;if(IS_INCLUDES&&el!=el)while(length>index){value=O[index++];if(value!=value)return true}else for(;length>index;index++)if(IS_INCLUDES||index in O){if(O[index]===el)return IS_INCLUDES||index}return!IS_INCLUDES&&-1}}},{"./$":16}],3:[function(require,module,exports){"use strict";var $=require("./$"),ctx=require("./$.ctx");module.exports=function(TYPE){var IS_MAP=TYPE==1,IS_FILTER=TYPE==2,IS_SOME=TYPE==3,IS_EVERY=TYPE==4,IS_FIND_INDEX=TYPE==6,NO_HOLES=TYPE==5||IS_FIND_INDEX;return function(callbackfn){var O=Object($.assertDefined(this)),self=$.ES5Object(O),f=ctx(callbackfn,arguments[1],3),length=$.toLength(self.length),index=0,result=IS_MAP?Array(length):IS_FILTER?[]:undefined,val,res;for(;length>index;index++)if(NO_HOLES||index in self){val=self[index];res=f(val,index,O);if(TYPE){if(IS_MAP)result[index]=res;else if(res)switch(TYPE){case 3:return true;case 5:return val;case 6:return index;case 2:result.push(val)}else if(IS_EVERY)return false}}return IS_FIND_INDEX?-1:IS_SOME||IS_EVERY?IS_EVERY:result}}},{"./$":16,"./$.ctx":10}],4:[function(require,module,exports){var $=require("./$");function assert(condition,msg1,msg2){if(!condition)throw TypeError(msg2?msg1+msg2:msg1)}assert.def=$.assertDefined;assert.fn=function(it){if(!$.isFunction(it))throw TypeError(it+" is not a function!");return it};assert.obj=function(it){if(!$.isObject(it))throw TypeError(it+" is not an object!");return it};assert.inst=function(it,Constructor,name){if(!(it instanceof Constructor))throw TypeError(name+": use the 'new' operator!");return it};module.exports=assert},{"./$":16}],5:[function(require,module,exports){var $=require("./$");module.exports=Object.assign||function assign(target,source){var T=Object($.assertDefined(target)),l=arguments.length,i=1;while(l>i){var S=$.ES5Object(arguments[i++]),keys=$.getKeys(S),length=keys.length,j=0,key;while(length>j)T[key=keys[j++]]=S[key]}return T}},{"./$":16}],6:[function(require,module,exports){var $=require("./$"),TAG=require("./$.wks")("toStringTag"),toString={}.toString;function cof(it){return toString.call(it).slice(8,-1)}cof.classof=function(it){var O,T;return it==undefined?it===undefined?"Undefined":"Null":typeof(T=(O=Object(it))[TAG])=="string"?T:cof(O)};cof.set=function(it,tag,stat){if(it&&!$.has(it=stat?it:it.prototype,TAG))$.hide(it,TAG,tag)};module.exports=cof},{"./$":16,"./$.wks":27}],7:[function(require,module,exports){"use strict";var $=require("./$"),ctx=require("./$.ctx"),safe=require("./$.uid").safe,assert=require("./$.assert"),$iter=require("./$.iter"),has=$.has,set=$.set,isObject=$.isObject,hide=$.hide,step=$iter.step,isFrozen=Object.isFrozen||$.core.Object.isFrozen,ID=safe("id"),O1=safe("O1"),LAST=safe("last"),FIRST=safe("first"),ITER=safe("iter"),SIZE=$.DESC?safe("size"):"size",id=0;function fastKey(it,create){if(!isObject(it))return(typeof it=="string"?"S":"P")+it;if(isFrozen(it))return"F";if(!has(it,ID)){if(!create)return"E";hide(it,ID,++id)}return"O"+it[ID]}function getEntry(that,key){var index=fastKey(key),entry;if(index!="F")return that[O1][index];for(entry=that[FIRST];entry;entry=entry.n){if(entry.k==key)return entry}}module.exports={getConstructor:function(NAME,IS_MAP,ADDER){function C(iterable){var that=assert.inst(this,C,NAME);set(that,O1,$.create(null));set(that,SIZE,0);set(that,LAST,undefined);set(that,FIRST,undefined);if(iterable!=undefined)$iter.forOf(iterable,IS_MAP,that[ADDER],that)}$.mix(C.prototype,{clear:function clear(){for(var that=this,data=that[O1],entry=that[FIRST];entry;entry=entry.n){entry.r=true;if(entry.p)entry.p=entry.p.n=undefined;delete data[entry.i]}that[FIRST]=that[LAST]=undefined;that[SIZE]=0},"delete":function(key){var that=this,entry=getEntry(that,key);if(entry){var next=entry.n,prev=entry.p;delete that[O1][entry.i];entry.r=true;if(prev)prev.n=next;if(next)next.p=prev;if(that[FIRST]==entry)that[FIRST]=next;if(that[LAST]==entry)that[LAST]=prev;that[SIZE]--}return!!entry},forEach:function forEach(callbackfn){var f=ctx(callbackfn,arguments[1],3),entry;while(entry=entry?entry.n:this[FIRST]){f(entry.v,entry.k,this);while(entry&&entry.r)entry=entry.p}},has:function has(key){return!!getEntry(this,key)}});if($.DESC)$.setDesc(C.prototype,"size",{get:function(){return assert.def(this[SIZE])}});return C},def:function(that,key,value){var entry=getEntry(that,key),prev,index;if(entry){entry.v=value}else{that[LAST]=entry={i:index=fastKey(key,true),k:key,v:value,p:prev=that[LAST],n:undefined,r:false};if(!that[FIRST])that[FIRST]=entry;if(prev)prev.n=entry;that[SIZE]++;if(index!="F")that[O1][index]=entry}return that},getEntry:getEntry,getIterConstructor:function(){return function(iterated,kind){set(this,ITER,{o:iterated,k:kind})}},next:function(){var iter=this[ITER],kind=iter.k,entry=iter.l;while(entry&&entry.r)entry=entry.p;if(!iter.o||!(iter.l=entry=entry?entry.n:iter.o[FIRST])){iter.o=undefined;return step(1)}if(kind=="key")return step(0,entry.k);if(kind=="value")return step(0,entry.v);return step(0,[entry.k,entry.v])}}},{"./$":16,"./$.assert":4,"./$.ctx":10,"./$.iter":15,"./$.uid":25}],8:[function(require,module,exports){"use strict";var $=require("./$"),safe=require("./$.uid").safe,assert=require("./$.assert"),forOf=require("./$.iter").forOf,_has=$.has,isObject=$.isObject,hide=$.hide,isFrozen=Object.isFrozen||$.core.Object.isFrozen,id=0,ID=safe("id"),WEAK=safe("weak"),LEAK=safe("leak"),method=require("./$.array-methods"),find=method(5),findIndex=method(6);function findFrozen(store,key){return find.call(store.array,function(it){return it[0]===key})}function leakStore(that){return that[LEAK]||hide(that,LEAK,{array:[],get:function(key){var entry=findFrozen(this,key);if(entry)return entry[1]},has:function(key){return!!findFrozen(this,key)},set:function(key,value){var entry=findFrozen(this,key);if(entry)entry[1]=value;else this.array.push([key,value])},"delete":function(key){var index=findIndex.call(this.array,function(it){return it[0]===key});if(~index)this.array.splice(index,1);return!!~index}})[LEAK]}module.exports={getConstructor:function(NAME,IS_MAP,ADDER){function C(iterable){$.set(assert.inst(this,C,NAME),ID,id++);if(iterable!=undefined)forOf(iterable,IS_MAP,this[ADDER],this)}$.mix(C.prototype,{"delete":function(key){if(!isObject(key))return false;if(isFrozen(key))return leakStore(this)["delete"](key);return _has(key,WEAK)&&_has(key[WEAK],this[ID])&&delete key[WEAK][this[ID]]},has:function has(key){if(!isObject(key))return false;if(isFrozen(key))return leakStore(this).has(key);return _has(key,WEAK)&&_has(key[WEAK],this[ID])}});return C},def:function(that,key,value){if(isFrozen(assert.obj(key))){leakStore(that).set(key,value)}else{_has(key,WEAK)||hide(key,WEAK,{});key[WEAK][that[ID]]=value}return that},leakStore:leakStore,WEAK:WEAK,ID:ID}},{"./$":16,"./$.array-methods":3,"./$.assert":4,"./$.iter":15,"./$.uid":25}],9:[function(require,module,exports){"use strict";var $=require("./$"),$def=require("./$.def"),$iter=require("./$.iter"),assertInstance=require("./$.assert").inst;module.exports=function(NAME,methods,common,IS_MAP,isWeak){var Base=$.g[NAME],C=Base,ADDER=IS_MAP?"set":"add",proto=C&&C.prototype,O={};function fixMethod(KEY,CHAIN){var method=proto[KEY];if($.FW)proto[KEY]=function(a,b){var result=method.call(this,a===0?0:a,b);return CHAIN?this:result}}if(!$.isFunction(C)||!(isWeak||!$iter.BUGGY&&proto.forEach&&proto.entries)){C=common.getConstructor(NAME,IS_MAP,ADDER);$.mix(C.prototype,methods)}else{var inst=new C,chain=inst[ADDER](isWeak?{}:-0,1),buggyZero;if(!require("./$.iter-detect")(function(iter){new C(iter)})){C=function(iterable){assertInstance(this,C,NAME);var that=new Base;if(iterable!=undefined)$iter.forOf(iterable,IS_MAP,that[ADDER],that);return that};C.prototype=proto;if($.FW)proto.constructor=C}isWeak||inst.forEach(function(val,key){buggyZero=1/key===-Infinity});if(buggyZero){fixMethod("delete");fixMethod("has");IS_MAP&&fixMethod("get")}if(buggyZero||chain!==inst)fixMethod(ADDER,true)}require("./$.cof").set(C,NAME);require("./$.species")(C);O[NAME]=C;$def($def.G+$def.W+$def.F*(C!=Base),O);if(!isWeak)$iter.std(C,NAME,common.getIterConstructor(),common.next,IS_MAP?"key+value":"value",!IS_MAP,true);return C}},{"./$":16,"./$.assert":4,"./$.cof":6,"./$.def":11,"./$.iter":15,"./$.iter-detect":14,"./$.species":22}],10:[function(require,module,exports){var assertFunction=require("./$.assert").fn;module.exports=function(fn,that,length){assertFunction(fn);if(~length&&that===undefined)return fn;switch(length){case 1:return function(a){return fn.call(that,a)};case 2:return function(a,b){return fn.call(that,a,b)};case 3:return function(a,b,c){return fn.call(that,a,b,c)}}return function(){return fn.apply(that,arguments)}}},{"./$.assert":4}],11:[function(require,module,exports){var $=require("./$"),global=$.g,core=$.core,isFunction=$.isFunction;function ctx(fn,that){return function(){return fn.apply(that,arguments)}}global.core=core;$def.F=1;$def.G=2;$def.S=4;$def.P=8;$def.B=16;$def.W=32;function $def(type,name,source){var key,own,out,exp,isGlobal=type&$def.G,target=isGlobal?global:type&$def.S?global[name]:(global[name]||{}).prototype,exports=isGlobal?core:core[name]||(core[name]={});if(isGlobal)source=name;for(key in source){own=!(type&$def.F)&&target&&key in target;out=(own?target:source)[key];if(type&$def.B&&own)exp=ctx(out,global);else exp=type&$def.P&&isFunction(out)?ctx(Function.call,out):out;if(target&&!own){if(isGlobal)target[key]=out;else delete target[key]&&$.hide(target,key,out)}if(exports[key]!=out)$.hide(exports,key,exp)}}module.exports=$def},{"./$":16}],12:[function(require,module,exports){module.exports=function($){$.FW=true;$.path=$.g;return $}},{}],13:[function(require,module,exports){module.exports=function(fn,args,that){var un=that===undefined;switch(args.length){case 0:return un?fn():fn.call(that);case 1:return un?fn(args[0]):fn.call(that,args[0]);case 2:return un?fn(args[0],args[1]):fn.call(that,args[0],args[1]);case 3:return un?fn(args[0],args[1],args[2]):fn.call(that,args[0],args[1],args[2]);case 4:return un?fn(args[0],args[1],args[2],args[3]):fn.call(that,args[0],args[1],args[2],args[3]);case 5:return un?fn(args[0],args[1],args[2],args[3],args[4]):fn.call(that,args[0],args[1],args[2],args[3],args[4])}return fn.apply(that,args)}},{}],14:[function(require,module,exports){var SYMBOL_ITERATOR=require("./$.wks")("iterator"),SAFE_CLOSING=false;try{var riter=[7][SYMBOL_ITERATOR]();riter["return"]=function(){SAFE_CLOSING=true};Array.from(riter,function(){throw 2})}catch(e){}module.exports=function(exec){if(!SAFE_CLOSING)return false;var safe=false;try{var arr=[7],iter=arr[SYMBOL_ITERATOR]();iter.next=function(){safe=true};arr[SYMBOL_ITERATOR]=function(){return iter};exec(arr)}catch(e){}return safe}},{"./$.wks":27}],15:[function(require,module,exports){"use strict";var $=require("./$"),ctx=require("./$.ctx"),cof=require("./$.cof"),$def=require("./$.def"),assertObject=require("./$.assert").obj,SYMBOL_ITERATOR=require("./$.wks")("iterator"),FF_ITERATOR="@@iterator",Iterators={},IteratorPrototype={};var BUGGY="keys"in[]&&!("next"in[].keys());setIterator(IteratorPrototype,$.that);function setIterator(O,value){$.hide(O,SYMBOL_ITERATOR,value);if(FF_ITERATOR in[])$.hide(O,FF_ITERATOR,value)}function defineIterator(Constructor,NAME,value,DEFAULT){var proto=Constructor.prototype,iter=proto[SYMBOL_ITERATOR]||proto[FF_ITERATOR]||DEFAULT&&proto[DEFAULT]||value;if($.FW)setIterator(proto,iter);if(iter!==value){var iterProto=$.getProto(iter.call(new Constructor));cof.set(iterProto,NAME+" Iterator",true);if($.FW)$.has(proto,FF_ITERATOR)&&setIterator(iterProto,$.that)}Iterators[NAME]=iter;Iterators[NAME+" Iterator"]=$.that;return iter}function getIterator(it){var Symbol=$.g.Symbol,ext=it[Symbol&&Symbol.iterator||FF_ITERATOR],getIter=ext||it[SYMBOL_ITERATOR]||Iterators[cof.classof(it)];return assertObject(getIter.call(it))}function closeIterator(iterator){var ret=iterator["return"];if(ret!==undefined)assertObject(ret.call(iterator))}function stepCall(iterator,fn,value,entries){try{return entries?fn(assertObject(value)[0],value[1]):fn(value)}catch(e){closeIterator(iterator);throw e}}var $iter=module.exports={BUGGY:BUGGY,Iterators:Iterators,prototype:IteratorPrototype,step:function(done,value){return{value:value,done:!!done}},stepCall:stepCall,close:closeIterator,is:function(it){var O=Object(it),Symbol=$.g.Symbol,SYM=Symbol&&Symbol.iterator||FF_ITERATOR;return SYM in O||SYMBOL_ITERATOR in O||$.has(Iterators,cof.classof(O))},get:getIterator,set:setIterator,create:function(Constructor,NAME,next,proto){Constructor.prototype=$.create(proto||$iter.prototype,{next:$.desc(1,next)});cof.set(Constructor,NAME+" Iterator")},define:defineIterator,std:function(Base,NAME,Constructor,next,DEFAULT,IS_SET,FORCE){function createIter(kind){return function(){return new Constructor(this,kind)}}$iter.create(Constructor,NAME,next);var entries=createIter("key+value"),values=createIter("value"),proto=Base.prototype,methods,key;if(DEFAULT=="value")values=defineIterator(Base,NAME,values,"values");else entries=defineIterator(Base,NAME,entries,"entries");if(DEFAULT){methods={entries:entries,keys:IS_SET?values:createIter("key"),values:values};$def($def.P+$def.F*BUGGY,NAME,methods);if(FORCE)for(key in methods){if(!(key in proto))$.hide(proto,key,methods[key])}}},forOf:function(iterable,entries,fn,that){var iterator=getIterator(iterable),f=ctx(fn,that,entries?2:1),step;while(!(step=iterator.next()).done){if(stepCall(iterator,f,step.value,entries)===false){return closeIterator(iterator)}}}}},{"./$":16,"./$.assert":4,"./$.cof":6,"./$.ctx":10,"./$.def":11,"./$.wks":27}],16:[function(require,module,exports){"use strict";var global=typeof self!="undefined"?self:Function("return this")(),core={},defineProperty=Object.defineProperty,hasOwnProperty={}.hasOwnProperty,ceil=Math.ceil,floor=Math.floor,max=Math.max,min=Math.min;var DESC=!!function(){try{return defineProperty({},"a",{get:function(){return 2}}).a==2}catch(e){}}();var hide=createDefiner(1);function toInteger(it){return isNaN(it=+it)?0:(it>0?floor:ceil)(it)}function desc(bitmap,value){return{enumerable:!(bitmap&1),configurable:!(bitmap&2),writable:!(bitmap&4),value:value}}function simpleSet(object,key,value){object[key]=value;return object}function createDefiner(bitmap){return DESC?function(object,key,value){return $.setDesc(object,key,desc(bitmap,value))}:simpleSet}function isObject(it){return it!==null&&(typeof it=="object"||typeof it=="function")}function isFunction(it){return typeof it=="function"}function assertDefined(it){if(it==undefined)throw TypeError("Can't call method on  "+it);return it}var $=module.exports=require("./$.fw")({g:global,core:core,html:global.document&&document.documentElement,isObject:isObject,isFunction:isFunction,it:function(it){return it},that:function(){return this},toInteger:toInteger,toLength:function(it){return it>0?min(toInteger(it),9007199254740991):0},toIndex:function(index,length){index=toInteger(index);return index<0?max(index+length,0):min(index,length)},has:function(it,key){return hasOwnProperty.call(it,key)},create:Object.create,getProto:Object.getPrototypeOf,DESC:DESC,desc:desc,getDesc:Object.getOwnPropertyDescriptor,setDesc:defineProperty,getKeys:Object.keys,getNames:Object.getOwnPropertyNames,getSymbols:Object.getOwnPropertySymbols,assertDefined:assertDefined,ES5Object:Object,toObject:function(it){return $.ES5Object(assertDefined(it))},hide:hide,def:createDefiner(0),set:global.Symbol?simpleSet:hide,mix:function(target,src){for(var key in src)hide(target,key,src[key]);return target},each:[].forEach});if(typeof __e!="undefined")__e=core;if(typeof __g!="undefined")__g=global},{"./$.fw":12}],17:[function(require,module,exports){var $=require("./$");module.exports=function(object,el){var O=$.toObject(object),keys=$.getKeys(O),length=keys.length,index=0,key;while(length>index)if(O[key=keys[index++]]===el)return key}},{"./$":16}],18:[function(require,module,exports){var $=require("./$"),assertObject=require("./$.assert").obj;module.exports=function ownKeys(it){assertObject(it);return $.getSymbols?$.getNames(it).concat($.getSymbols(it)):$.getNames(it)}},{"./$":16,"./$.assert":4}],19:[function(require,module,exports){"use strict";var $=require("./$"),invoke=require("./$.invoke"),assertFunction=require("./$.assert").fn;module.exports=function(){var fn=assertFunction(this),length=arguments.length,pargs=Array(length),i=0,_=$.path._,holder=false;while(length>i)if((pargs[i]=arguments[i++])===_)holder=true;return function(){var that=this,_length=arguments.length,j=0,k=0,args;if(!holder&&!_length)return invoke(fn,pargs,that);args=pargs.slice();if(holder)for(;length>j;j++)if(args[j]===_)args[j]=arguments[k++];while(_length>k)args.push(arguments[k++]);return invoke(fn,args,that)}}},{"./$":16,"./$.assert":4,"./$.invoke":13}],20:[function(require,module,exports){"use strict";module.exports=function(regExp,replace,isStatic){var replacer=replace===Object(replace)?function(part){return replace[part]}:replace;return function(it){return String(isStatic?it:this).replace(regExp,replacer)}}},{}],21:[function(require,module,exports){var $=require("./$"),assert=require("./$.assert");function check(O,proto){assert.obj(O);assert(proto===null||$.isObject(proto),proto,": can't set as prototype!")}module.exports={set:Object.setPrototypeOf||("__proto__"in{}?function(buggy,set){try{set=require("./$.ctx")(Function.call,$.getDesc(Object.prototype,"__proto__").set,2);set({},[])}catch(e){buggy=true}return function setPrototypeOf(O,proto){check(O,proto);if(buggy)O.__proto__=proto;else set(O,proto);return O}}():undefined),check:check}},{"./$":16,"./$.assert":4,"./$.ctx":10}],22:[function(require,module,exports){var $=require("./$");module.exports=function(C){if($.DESC&&$.FW)$.setDesc(C,require("./$.wks")("species"),{configurable:true,get:$.that})}},{"./$":16,"./$.wks":27}],23:[function(require,module,exports){"use strict";var $=require("./$");module.exports=function(TO_STRING){return function(pos){var s=String($.assertDefined(this)),i=$.toInteger(pos),l=s.length,a,b;if(i<0||i>=l)return TO_STRING?"":undefined;a=s.charCodeAt(i);return a<55296||a>56319||i+1===l||(b=s.charCodeAt(i+1))<56320||b>57343?TO_STRING?s.charAt(i):a:TO_STRING?s.slice(i,i+2):(a-55296<<10)+(b-56320)+65536}}},{"./$":16}],24:[function(require,module,exports){"use strict";var $=require("./$"),ctx=require("./$.ctx"),cof=require("./$.cof"),invoke=require("./$.invoke"),global=$.g,isFunction=$.isFunction,html=$.html,document=global.document,process=global.process,setTask=global.setImmediate,clearTask=global.clearImmediate,postMessage=global.postMessage,addEventListener=global.addEventListener,MessageChannel=global.MessageChannel,counter=0,queue={},ONREADYSTATECHANGE="onreadystatechange",defer,channel,port;function run(){var id=+this;if($.has(queue,id)){var fn=queue[id];delete queue[id];fn()}}function listner(event){run.call(event.data)}if(!isFunction(setTask)||!isFunction(clearTask)){setTask=function(fn){var args=[],i=1;while(arguments.length>i)args.push(arguments[i++]);queue[++counter]=function(){invoke(isFunction(fn)?fn:Function(fn),args)};defer(counter);return counter};clearTask=function(id){delete queue[id]};if(cof(process)=="process"){defer=function(id){process.nextTick(ctx(run,id,1))}}else if(addEventListener&&isFunction(postMessage)&&!global.importScripts){defer=function(id){postMessage(id,"*")};addEventListener("message",listner,false)}else if(isFunction(MessageChannel)){channel=new MessageChannel;port=channel.port2;channel.port1.onmessage=listner;defer=ctx(port.postMessage,port,1)}else if(document&&ONREADYSTATECHANGE in document.createElement("script")){defer=function(id){html.appendChild(document.createElement("script"))[ONREADYSTATECHANGE]=function(){html.removeChild(this);run.call(id)}}}else{defer=function(id){setTimeout(ctx(run,id,1),0)}}}module.exports={set:setTask,clear:clearTask}},{"./$":16,"./$.cof":6,"./$.ctx":10,"./$.invoke":13}],25:[function(require,module,exports){var sid=0;function uid(key){return"Symbol("+key+")_"+(++sid+Math.random()).toString(36)}uid.safe=require("./$").g.Symbol||uid;module.exports=uid},{"./$":16}],26:[function(require,module,exports){var $=require("./$"),UNSCOPABLES=require("./$.wks")("unscopables");if($.FW&&!(UNSCOPABLES in[]))$.hide(Array.prototype,UNSCOPABLES,{});module.exports=function(key){if($.FW)[][UNSCOPABLES][key]=true}},{"./$":16,"./$.wks":27}],27:[function(require,module,exports){var global=require("./$").g,store={};module.exports=function(name){return store[name]||(store[name]=global.Symbol&&global.Symbol[name]||require("./$.uid").safe("Symbol."+name))}},{"./$":16,"./$.uid":25}],28:[function(require,module,exports){var $=require("./$"),cof=require("./$.cof"),$def=require("./$.def"),invoke=require("./$.invoke"),arrayMethod=require("./$.array-methods"),IE_PROTO=require("./$.uid").safe("__proto__"),assert=require("./$.assert"),assertObject=assert.obj,ObjectProto=Object.prototype,A=[],slice=A.slice,indexOf=A.indexOf,classof=cof.classof,defineProperties=Object.defineProperties,has=$.has,defineProperty=$.setDesc,getOwnDescriptor=$.getDesc,isFunction=$.isFunction,toObject=$.toObject,toLength=$.toLength,IE8_DOM_DEFINE=false;if(!$.DESC){try{IE8_DOM_DEFINE=defineProperty(document.createElement("div"),"x",{get:function(){return 8}}).x==8}catch(e){}$.setDesc=function(O,P,Attributes){if(IE8_DOM_DEFINE)try{return defineProperty(O,P,Attributes)}catch(e){}if("get"in Attributes||"set"in Attributes)throw TypeError("Accessors not supported!");if("value"in Attributes)assertObject(O)[P]=Attributes.value;return O};$.getDesc=function(O,P){if(IE8_DOM_DEFINE)try{return getOwnDescriptor(O,P)}catch(e){}if(has(O,P))return $.desc(!ObjectProto.propertyIsEnumerable.call(O,P),O[P])};defineProperties=function(O,Properties){assertObject(O);var keys=$.getKeys(Properties),length=keys.length,i=0,P;while(length>i)$.setDesc(O,P=keys[i++],Properties[P]);return O}}$def($def.S+$def.F*!$.DESC,"Object",{getOwnPropertyDescriptor:$.getDesc,defineProperty:$.setDesc,defineProperties:defineProperties});var keys1=("constructor,hasOwnProperty,isPrototypeOf,propertyIsEnumerable,"+"toLocaleString,toString,valueOf").split(","),keys2=keys1.concat("length","prototype"),keysLen1=keys1.length;var createDict=function(){var iframe=document.createElement("iframe"),i=keysLen1,gt=">",iframeDocument;iframe.style.display="none";$.html.appendChild(iframe);iframe.src="javascript:";iframeDocument=iframe.contentWindow.document;iframeDocument.open();iframeDocument.write("<script>document.F=Object</script"+gt);iframeDocument.close();createDict=iframeDocument.F;while(i--)delete createDict.prototype[keys1[i]];return createDict()};function createGetKeys(names,length){return function(object){var O=toObject(object),i=0,result=[],key;for(key in O)if(key!=IE_PROTO)has(O,key)&&result.push(key);while(length>i)if(has(O,key=names[i++])){~indexOf.call(result,key)||result.push(key)}return result}}function isPrimitive(it){return!$.isObject(it)}function Empty(){}$def($def.S,"Object",{getPrototypeOf:$.getProto=$.getProto||function(O){O=Object(assert.def(O));if(has(O,IE_PROTO))return O[IE_PROTO];if(isFunction(O.constructor)&&O instanceof O.constructor){return O.constructor.prototype}return O instanceof Object?ObjectProto:null},getOwnPropertyNames:$.getNames=$.getNames||createGetKeys(keys2,keys2.length,true),create:$.create=$.create||function(O,Properties){var result;if(O!==null){Empty.prototype=assertObject(O);result=new Empty;Empty.prototype=null;result[IE_PROTO]=O}else result=createDict();return Properties===undefined?result:defineProperties(result,Properties)},keys:$.getKeys=$.getKeys||createGetKeys(keys1,keysLen1,false),seal:$.it,freeze:$.it,preventExtensions:$.it,isSealed:isPrimitive,isFrozen:isPrimitive,isExtensible:$.isObject});$def($def.P,"Function",{bind:function(that){var fn=assert.fn(this),partArgs=slice.call(arguments,1);function bound(){var args=partArgs.concat(slice.call(arguments));return invoke(fn,args,this instanceof bound?$.create(fn.prototype):that)}if(fn.prototype)bound.prototype=fn.prototype;return bound}});function arrayMethodFix(fn){return function(){return fn.apply($.ES5Object(this),arguments)}}if(!(0 in Object("z")&&"z"[0]=="z")){$.ES5Object=function(it){return cof(it)=="String"?it.split(""):Object(it)}}$def($def.P+$def.F*($.ES5Object!=Object),"Array",{slice:arrayMethodFix(slice),join:arrayMethodFix(A.join)});$def($def.S,"Array",{isArray:function(arg){return cof(arg)=="Array"}});function createArrayReduce(isRight){return function(callbackfn,memo){assert.fn(callbackfn);var O=toObject(this),length=toLength(O.length),index=isRight?length-1:0,i=isRight?-1:1;if(arguments.length<2)for(;;){if(index in O){memo=O[index];index+=i;break}index+=i;assert(isRight?index>=0:length>index,"Reduce of empty array with no initial value")}for(;isRight?index>=0:length>index;index+=i)if(index in O){memo=callbackfn(memo,O[index],index,this)}return memo}}$def($def.P,"Array",{forEach:$.each=$.each||arrayMethod(0),map:arrayMethod(1),filter:arrayMethod(2),some:arrayMethod(3),every:arrayMethod(4),reduce:createArrayReduce(false),reduceRight:createArrayReduce(true),indexOf:indexOf=indexOf||require("./$.array-includes")(false),lastIndexOf:function(el,fromIndex){var O=toObject(this),length=toLength(O.length),index=length-1;if(arguments.length>1)index=Math.min(index,$.toInteger(fromIndex));if(index<0)index=toLength(length+index);for(;index>=0;index--)if(index in O)if(O[index]===el)return index;return-1}});$def($def.P,"String",{trim:require("./$.replacer")(/^\s*([\s\S]*\S)?\s*$/,"$1")});$def($def.S,"Date",{now:function(){return+new Date}});function lz(num){return num>9?num:"0"+num}$def($def.P,"Date",{toISOString:function(){if(!isFinite(this))throw RangeError("Invalid time value");var d=this,y=d.getUTCFullYear(),m=d.getUTCMilliseconds(),s=y<0?"-":y>9999?"+":"";return s+("00000"+Math.abs(y)).slice(s?-6:-4)+"-"+lz(d.getUTCMonth()+1)+"-"+lz(d.getUTCDate())+"T"+lz(d.getUTCHours())+":"+lz(d.getUTCMinutes())+":"+lz(d.getUTCSeconds())+"."+(m>99?m:"0"+lz(m))+"Z"}});if(classof(function(){return arguments}())=="Object")cof.classof=function(it){var tag=classof(it);return tag=="Object"&&isFunction(it.callee)?"Arguments":tag}},{"./$":16,"./$.array-includes":2,"./$.array-methods":3,"./$.assert":4,"./$.cof":6,"./$.def":11,"./$.invoke":13,"./$.replacer":20,"./$.uid":25}],29:[function(require,module,exports){"use strict";var $=require("./$"),$def=require("./$.def"),toIndex=$.toIndex;$def($def.P,"Array",{copyWithin:function copyWithin(target,start){var O=Object($.assertDefined(this)),len=$.toLength(O.length),to=toIndex(target,len),from=toIndex(start,len),end=arguments[2],fin=end===undefined?len:toIndex(end,len),count=Math.min(fin-from,len-to),inc=1;if(from<to&&to<from+count){inc=-1;from=from+count-1;to=to+count-1}while(count-->0){if(from in O)O[to]=O[from];else delete O[to];to+=inc;from+=inc}return O}});require("./$.unscope")("copyWithin")},{"./$":16,"./$.def":11,"./$.unscope":26}],30:[function(require,module,exports){"use strict";var $=require("./$"),$def=require("./$.def"),toIndex=$.toIndex;$def($def.P,"Array",{fill:function fill(value){var O=Object($.assertDefined(this)),length=$.toLength(O.length),index=toIndex(arguments[1],length),end=arguments[2],endPos=end===undefined?length:toIndex(end,length);while(endPos>index)O[index++]=value;return O}});require("./$.unscope")("fill")},{"./$":16,"./$.def":11,"./$.unscope":26}],31:[function(require,module,exports){var $def=require("./$.def");$def($def.P,"Array",{findIndex:require("./$.array-methods")(6)});require("./$.unscope")("findIndex")},{"./$.array-methods":3,"./$.def":11,"./$.unscope":26}],32:[function(require,module,exports){var $def=require("./$.def");$def($def.P,"Array",{find:require("./$.array-methods")(5)});require("./$.unscope")("find")},{"./$.array-methods":3,"./$.def":11,"./$.unscope":26}],33:[function(require,module,exports){var $=require("./$"),ctx=require("./$.ctx"),$def=require("./$.def"),$iter=require("./$.iter"),stepCall=$iter.stepCall;$def($def.S+$def.F*!require("./$.iter-detect")(function(iter){Array.from(iter)}),"Array",{from:function from(arrayLike){var O=Object($.assertDefined(arrayLike)),mapfn=arguments[1],mapping=mapfn!==undefined,f=mapping?ctx(mapfn,arguments[2],2):undefined,index=0,length,result,step,iterator;if($iter.is(O)){iterator=$iter.get(O);result=new(typeof this=="function"?this:Array);for(;!(step=iterator.next()).done;index++){result[index]=mapping?stepCall(iterator,f,[step.value,index],true):step.value}}else{result=new(typeof this=="function"?this:Array)(length=$.toLength(O.length));for(;length>index;index++){result[index]=mapping?f(O[index],index):O[index]}}result.length=index;return result}})},{"./$":16,"./$.ctx":10,"./$.def":11,"./$.iter":15,"./$.iter-detect":14}],34:[function(require,module,exports){var $=require("./$"),setUnscope=require("./$.unscope"),ITER=require("./$.uid").safe("iter"),$iter=require("./$.iter"),step=$iter.step,Iterators=$iter.Iterators;$iter.std(Array,"Array",function(iterated,kind){$.set(this,ITER,{o:$.toObject(iterated),i:0,k:kind})},function(){var iter=this[ITER],O=iter.o,kind=iter.k,index=iter.i++;if(!O||index>=O.length){iter.o=undefined;return step(1)}if(kind=="key")return step(0,index);if(kind=="value")return step(0,O[index]);return step(0,[index,O[index]])},"value");Iterators.Arguments=Iterators.Array;setUnscope("keys");setUnscope("values");setUnscope("entries")},{"./$":16,"./$.iter":15,"./$.uid":25,"./$.unscope":26}],35:[function(require,module,exports){var $def=require("./$.def");$def($def.S,"Array",{of:function of(){var index=0,length=arguments.length,result=new(typeof this=="function"?this:Array)(length);while(length>index)result[index]=arguments[index++];result.length=length;return result}})},{"./$.def":11}],36:[function(require,module,exports){require("./$.species")(Array)},{"./$.species":22}],37:[function(require,module,exports){"use strict";var $=require("./$"),NAME="name",setDesc=$.setDesc,FunctionProto=Function.prototype;NAME in FunctionProto||$.FW&&$.DESC&&setDesc(FunctionProto,NAME,{configurable:true,get:function(){var match=String(this).match(/^\s*function ([^ (]*)/),name=match?match[1]:"";$.has(this,NAME)||setDesc(this,NAME,$.desc(5,name));return name},set:function(value){$.has(this,NAME)||setDesc(this,NAME,$.desc(0,value))}})},{"./$":16}],38:[function(require,module,exports){"use strict";var strong=require("./$.collection-strong");require("./$.collection")("Map",{get:function get(key){var entry=strong.getEntry(this,key);return entry&&entry.v},set:function set(key,value){return strong.def(this,key===0?0:key,value)}},strong,true)},{"./$.collection":9,"./$.collection-strong":7}],39:[function(require,module,exports){var Infinity=1/0,$def=require("./$.def"),E=Math.E,pow=Math.pow,abs=Math.abs,exp=Math.exp,log=Math.log,sqrt=Math.sqrt,ceil=Math.ceil,floor=Math.floor,EPSILON=pow(2,-52),EPSILON32=pow(2,-23),MAX32=pow(2,127)*(2-EPSILON32),MIN32=pow(2,-126);function roundTiesToEven(n){return n+1/EPSILON-1/EPSILON}function sign(x){return(x=+x)==0||x!=x?x:x<0?-1:1;

}function asinh(x){return!isFinite(x=+x)||x==0?x:x<0?-asinh(-x):log(x+sqrt(x*x+1))}function expm1(x){return(x=+x)==0?x:x>-1e-6&&x<1e-6?x+x*x/2:exp(x)-1}$def($def.S,"Math",{acosh:function acosh(x){return(x=+x)<1?NaN:isFinite(x)?log(x/E+sqrt(x+1)*sqrt(x-1)/E)+1:x},asinh:asinh,atanh:function atanh(x){return(x=+x)==0?x:log((1+x)/(1-x))/2},cbrt:function cbrt(x){return sign(x=+x)*pow(abs(x),1/3)},clz32:function clz32(x){return(x>>>=0)?31-floor(log(x+.5)*Math.LOG2E):32},cosh:function cosh(x){return(exp(x=+x)+exp(-x))/2},expm1:expm1,fround:function fround(x){var $abs=abs(x),$sign=sign(x),a,result;if($abs<MIN32)return $sign*roundTiesToEven($abs/MIN32/EPSILON32)*MIN32*EPSILON32;a=(1+EPSILON32/EPSILON)*$abs;result=a-(a-$abs);if(result>MAX32||result!=result)return $sign*Infinity;return $sign*result},hypot:function hypot(value1,value2){var sum=0,len1=arguments.length,len2=len1,args=Array(len1),larg=-Infinity,arg;while(len1--){arg=args[len1]=+arguments[len1];if(arg==Infinity||arg==-Infinity)return Infinity;if(arg>larg)larg=arg}larg=arg||1;while(len2--)sum+=pow(args[len2]/larg,2);return larg*sqrt(sum)},imul:function imul(x,y){var UInt16=65535,xn=+x,yn=+y,xl=UInt16&xn,yl=UInt16&yn;return 0|xl*yl+((UInt16&xn>>>16)*yl+xl*(UInt16&yn>>>16)<<16>>>0)},log1p:function log1p(x){return(x=+x)>-1e-8&&x<1e-8?x-x*x/2:log(1+x)},log10:function log10(x){return log(x)/Math.LN10},log2:function log2(x){return log(x)/Math.LN2},sign:sign,sinh:function sinh(x){return abs(x=+x)<1?(expm1(x)-expm1(-x))/2:(exp(x-1)-exp(-x-1))*(E/2)},tanh:function tanh(x){var a=expm1(x=+x),b=expm1(-x);return a==Infinity?1:b==Infinity?-1:(a-b)/(exp(x)+exp(-x))},trunc:function trunc(it){return(it>0?floor:ceil)(it)}})},{"./$.def":11}],40:[function(require,module,exports){"use strict";var $=require("./$"),isObject=$.isObject,isFunction=$.isFunction,NUMBER="Number",Number=$.g[NUMBER],Base=Number,proto=Number.prototype;function toPrimitive(it){var fn,val;if(isFunction(fn=it.valueOf)&&!isObject(val=fn.call(it)))return val;if(isFunction(fn=it.toString)&&!isObject(val=fn.call(it)))return val;throw TypeError("Can't convert object to number")}function toNumber(it){if(isObject(it))it=toPrimitive(it);if(typeof it=="string"&&it.length>2&&it.charCodeAt(0)==48){var binary=false;switch(it.charCodeAt(1)){case 66:case 98:binary=true;case 79:case 111:return parseInt(it.slice(2),binary?2:8)}}return+it}if($.FW&&!(Number("0o1")&&Number("0b1"))){Number=function Number(it){return this instanceof Number?new Base(toNumber(it)):toNumber(it)};$.each.call($.DESC?$.getNames(Base):("MAX_VALUE,MIN_VALUE,NaN,NEGATIVE_INFINITY,POSITIVE_INFINITY,"+"EPSILON,isFinite,isInteger,isNaN,isSafeInteger,MAX_SAFE_INTEGER,"+"MIN_SAFE_INTEGER,parseFloat,parseInt,isInteger").split(","),function(key){if($.has(Base,key)&&!$.has(Number,key)){$.setDesc(Number,key,$.getDesc(Base,key))}});Number.prototype=proto;proto.constructor=Number;$.hide($.g,NUMBER,Number)}},{"./$":16}],41:[function(require,module,exports){var $=require("./$"),$def=require("./$.def"),abs=Math.abs,floor=Math.floor,_isFinite=$.g.isFinite,MAX_SAFE_INTEGER=9007199254740991;function isInteger(it){return!$.isObject(it)&&_isFinite(it)&&floor(it)===it}$def($def.S,"Number",{EPSILON:Math.pow(2,-52),isFinite:function isFinite(it){return typeof it=="number"&&_isFinite(it)},isInteger:isInteger,isNaN:function isNaN(number){return number!=number},isSafeInteger:function isSafeInteger(number){return isInteger(number)&&abs(number)<=MAX_SAFE_INTEGER},MAX_SAFE_INTEGER:MAX_SAFE_INTEGER,MIN_SAFE_INTEGER:-MAX_SAFE_INTEGER,parseFloat:parseFloat,parseInt:parseInt})},{"./$":16,"./$.def":11}],42:[function(require,module,exports){var $def=require("./$.def");$def($def.S,"Object",{assign:require("./$.assign")})},{"./$.assign":5,"./$.def":11}],43:[function(require,module,exports){var $def=require("./$.def");$def($def.S,"Object",{is:function is(x,y){return x===y?x!==0||1/x===1/y:x!=x&&y!=y}})},{"./$.def":11}],44:[function(require,module,exports){var $def=require("./$.def");$def($def.S,"Object",{setPrototypeOf:require("./$.set-proto").set})},{"./$.def":11,"./$.set-proto":21}],45:[function(require,module,exports){var $=require("./$"),$def=require("./$.def"),isObject=$.isObject,toObject=$.toObject;function wrapObjectMethod(METHOD,MODE){var fn=($.core.Object||{})[METHOD]||Object[METHOD],f=0,o={};o[METHOD]=MODE==1?function(it){return isObject(it)?fn(it):it}:MODE==2?function(it){return isObject(it)?fn(it):true}:MODE==3?function(it){return isObject(it)?fn(it):false}:MODE==4?function getOwnPropertyDescriptor(it,key){return fn(toObject(it),key)}:MODE==5?function getPrototypeOf(it){return fn(Object($.assertDefined(it)))}:function(it){return fn(toObject(it))};try{fn("z")}catch(e){f=1}$def($def.S+$def.F*f,"Object",o)}wrapObjectMethod("freeze",1);wrapObjectMethod("seal",1);wrapObjectMethod("preventExtensions",1);wrapObjectMethod("isFrozen",2);wrapObjectMethod("isSealed",2);wrapObjectMethod("isExtensible",3);wrapObjectMethod("getOwnPropertyDescriptor",4);wrapObjectMethod("getPrototypeOf",5);wrapObjectMethod("keys");wrapObjectMethod("getOwnPropertyNames")},{"./$":16,"./$.def":11}],46:[function(require,module,exports){"use strict";var $=require("./$"),cof=require("./$.cof"),tmp={};tmp[require("./$.wks")("toStringTag")]="z";if($.FW&&cof(tmp)!="z")$.hide(Object.prototype,"toString",function toString(){return"[object "+cof.classof(this)+"]"})},{"./$":16,"./$.cof":6,"./$.wks":27}],47:[function(require,module,exports){"use strict";var $=require("./$"),ctx=require("./$.ctx"),cof=require("./$.cof"),$def=require("./$.def"),assert=require("./$.assert"),$iter=require("./$.iter"),SPECIES=require("./$.wks")("species"),RECORD=require("./$.uid").safe("record"),forOf=$iter.forOf,PROMISE="Promise",global=$.g,process=global.process,asap=process&&process.nextTick||require("./$.task").set,P=global[PROMISE],Base=P,isFunction=$.isFunction,isObject=$.isObject,assertFunction=assert.fn,assertObject=assert.obj,test;function getConstructor(C){var S=assertObject(C)[SPECIES];return S!=undefined?S:C}function isThenable(it){var then;if(isObject(it))then=it.then;return isFunction(then)?then:false}function isUnhandled(promise){var record=promise[RECORD],chain=record.c,i=0,react;if(record.h)return false;while(chain.length>i){react=chain[i++];if(react.fail||!isUnhandled(react.P))return false}return true}function notify(record,isReject){var chain=record.c;if(isReject||chain.length)asap(function(){var promise=record.p,value=record.v,ok=record.s==1,i=0;if(isReject&&isUnhandled(promise)){setTimeout(function(){if(isUnhandled(promise)){if(cof(process)=="process"){process.emit("unhandledRejection",value,promise)}else if(global.console&&isFunction(console.error)){console.error("Unhandled promise rejection",value)}}},1e3)}else while(chain.length>i)!function(react){var cb=ok?react.ok:react.fail,ret,then;try{if(cb){if(!ok)record.h=true;ret=cb===true?value:cb(value);if(ret===react.P){react.rej(TypeError(PROMISE+"-chain cycle"))}else if(then=isThenable(ret)){then.call(ret,react.res,react.rej)}else react.res(ret)}else react.rej(value)}catch(err){react.rej(err)}}(chain[i++]);chain.length=0})}function $reject(value){var record=this;if(record.d)return;record.d=true;record=record.r||record;record.v=value;record.s=2;notify(record,true)}function $resolve(value){var record=this,then,wrapper;if(record.d)return;record.d=true;record=record.r||record;try{if(then=isThenable(value)){wrapper={r:record,d:false};then.call(value,ctx($resolve,wrapper,1),ctx($reject,wrapper,1))}else{record.v=value;record.s=1;notify(record)}}catch(err){$reject.call(wrapper||{r:record,d:false},err)}}if(!(isFunction(P)&&isFunction(P.resolve)&&P.resolve(test=new P(function(){}))==test)){P=function Promise(executor){assertFunction(executor);var record={p:assert.inst(this,P,PROMISE),c:[],s:0,d:false,v:undefined,h:false};$.hide(this,RECORD,record);try{executor(ctx($resolve,record,1),ctx($reject,record,1))}catch(err){$reject.call(record,err)}};$.mix(P.prototype,{then:function then(onFulfilled,onRejected){var S=assertObject(assertObject(this).constructor)[SPECIES];var react={ok:isFunction(onFulfilled)?onFulfilled:true,fail:isFunction(onRejected)?onRejected:false};var promise=react.P=new(S!=undefined?S:P)(function(res,rej){react.res=assertFunction(res);react.rej=assertFunction(rej)});var record=this[RECORD];record.c.push(react);record.s&&notify(record);return promise},"catch":function(onRejected){return this.then(undefined,onRejected)}})}$def($def.G+$def.W+$def.F*(P!=Base),{Promise:P});cof.set(P,PROMISE);require("./$.species")(P);$def($def.S,PROMISE,{reject:function reject(r){return new(getConstructor(this))(function(res,rej){rej(r)})},resolve:function resolve(x){return isObject(x)&&RECORD in x&&$.getProto(x)===this.prototype?x:new(getConstructor(this))(function(res){res(x)})}});$def($def.S+$def.F*!require("./$.iter-detect")(function(iter){P.all(iter)["catch"](function(){})}),PROMISE,{all:function all(iterable){var C=getConstructor(this),values=[];return new C(function(res,rej){forOf(iterable,false,values.push,values);var remaining=values.length,results=Array(remaining);if(remaining)$.each.call(values,function(promise,index){C.resolve(promise).then(function(value){results[index]=value;--remaining||res(results)},rej)});else res(results)})},race:function race(iterable){var C=getConstructor(this);return new C(function(res,rej){forOf(iterable,false,function(promise){C.resolve(promise).then(res,rej)})})}})},{"./$":16,"./$.assert":4,"./$.cof":6,"./$.ctx":10,"./$.def":11,"./$.iter":15,"./$.iter-detect":14,"./$.species":22,"./$.task":24,"./$.uid":25,"./$.wks":27}],48:[function(require,module,exports){var $=require("./$"),$def=require("./$.def"),setProto=require("./$.set-proto"),$iter=require("./$.iter"),ITER=require("./$.uid").safe("iter"),step=$iter.step,assert=require("./$.assert"),isObject=$.isObject,getDesc=$.getDesc,setDesc=$.setDesc,getProto=$.getProto,apply=Function.apply,assertObject=assert.obj,_isExtensible=Object.isExtensible||$.it;function Enumerate(iterated){var keys=[],key;for(key in iterated)keys.push(key);$.set(this,ITER,{o:iterated,a:keys,i:0})}$iter.create(Enumerate,"Object",function(){var iter=this[ITER],keys=iter.a,key;do{if(iter.i>=keys.length)return step(1)}while(!((key=keys[iter.i++])in iter.o));return step(0,key)});function wrap(fn){return function(it){assertObject(it);try{fn.apply(undefined,arguments);return true}catch(e){return false}}}function get(target,propertyKey){var receiver=arguments.length<3?target:arguments[2],desc=getDesc(assertObject(target),propertyKey),proto;if(desc)return $.has(desc,"value")?desc.value:desc.get===undefined?undefined:desc.get.call(receiver);return isObject(proto=getProto(target))?get(proto,propertyKey,receiver):undefined}function set(target,propertyKey,V){var receiver=arguments.length<4?target:arguments[3],ownDesc=getDesc(assertObject(target),propertyKey),existingDescriptor,proto;if(!ownDesc){if(isObject(proto=getProto(target))){return set(proto,propertyKey,V,receiver)}ownDesc=$.desc(0)}if($.has(ownDesc,"value")){if(ownDesc.writable===false||!isObject(receiver))return false;existingDescriptor=getDesc(receiver,propertyKey)||$.desc(0);existingDescriptor.value=V;setDesc(receiver,propertyKey,existingDescriptor);return true}return ownDesc.set===undefined?false:(ownDesc.set.call(receiver,V),true)}var reflect={apply:require("./$.ctx")(Function.call,apply,3),construct:function construct(target,argumentsList){var proto=assert.fn(arguments.length<3?target:arguments[2]).prototype,instance=$.create(isObject(proto)?proto:Object.prototype),result=apply.call(target,instance,argumentsList);return isObject(result)?result:instance},defineProperty:wrap(setDesc),deleteProperty:function deleteProperty(target,propertyKey){var desc=getDesc(assertObject(target),propertyKey);return desc&&!desc.configurable?false:delete target[propertyKey]},enumerate:function enumerate(target){return new Enumerate(assertObject(target))},get:get,getOwnPropertyDescriptor:function getOwnPropertyDescriptor(target,propertyKey){return getDesc(assertObject(target),propertyKey)},getPrototypeOf:function getPrototypeOf(target){return getProto(assertObject(target))},has:function has(target,propertyKey){return propertyKey in target},isExtensible:function isExtensible(target){return!!_isExtensible(assertObject(target))},ownKeys:require("./$.own-keys"),preventExtensions:wrap(Object.preventExtensions||$.it),set:set};if(setProto)reflect.setPrototypeOf=function setPrototypeOf(target,proto){setProto.check(target,proto);try{setProto.set(target,proto);return true}catch(e){return false}};$def($def.G,{Reflect:{}});$def($def.S,"Reflect",reflect)},{"./$":16,"./$.assert":4,"./$.ctx":10,"./$.def":11,"./$.iter":15,"./$.own-keys":18,"./$.set-proto":21,"./$.uid":25}],49:[function(require,module,exports){var $=require("./$"),cof=require("./$.cof"),RegExp=$.g.RegExp,Base=RegExp,proto=RegExp.prototype;if($.FW&&$.DESC){if(!function(){try{return RegExp(/a/g,"i")=="/a/i"}catch(e){}}()){RegExp=function RegExp(pattern,flags){return new Base(cof(pattern)=="RegExp"&&flags!==undefined?pattern.source:pattern,flags)};$.each.call($.getNames(Base),function(key){key in RegExp||$.setDesc(RegExp,key,{configurable:true,get:function(){return Base[key]},set:function(it){Base[key]=it}})});proto.constructor=RegExp;RegExp.prototype=proto;$.hide($.g,"RegExp",RegExp)}if(/./g.flags!="g")$.setDesc(proto,"flags",{configurable:true,get:require("./$.replacer")(/^.*\/(\w*)$/,"$1")})}require("./$.species")(RegExp)},{"./$":16,"./$.cof":6,"./$.replacer":20,"./$.species":22}],50:[function(require,module,exports){"use strict";var strong=require("./$.collection-strong");require("./$.collection")("Set",{add:function add(value){return strong.def(this,value=value===0?0:value,value)}},strong)},{"./$.collection":9,"./$.collection-strong":7}],51:[function(require,module,exports){var $def=require("./$.def");$def($def.P,"String",{codePointAt:require("./$.string-at")(false)})},{"./$.def":11,"./$.string-at":23}],52:[function(require,module,exports){"use strict";var $=require("./$"),cof=require("./$.cof"),$def=require("./$.def"),toLength=$.toLength;$def($def.P,"String",{endsWith:function endsWith(searchString){if(cof(searchString)=="RegExp")throw TypeError();var that=String($.assertDefined(this)),endPosition=arguments[1],len=toLength(that.length),end=endPosition===undefined?len:Math.min(toLength(endPosition),len);searchString+="";return that.slice(end-searchString.length,end)===searchString}})},{"./$":16,"./$.cof":6,"./$.def":11}],53:[function(require,module,exports){var $def=require("./$.def"),toIndex=require("./$").toIndex,fromCharCode=String.fromCharCode;$def($def.S,"String",{fromCodePoint:function fromCodePoint(x){var res=[],len=arguments.length,i=0,code;while(len>i){code=+arguments[i++];if(toIndex(code,1114111)!==code)throw RangeError(code+" is not a valid code point");res.push(code<65536?fromCharCode(code):fromCharCode(((code-=65536)>>10)+55296,code%1024+56320))}return res.join("")}})},{"./$":16,"./$.def":11}],54:[function(require,module,exports){"use strict";var $=require("./$"),cof=require("./$.cof"),$def=require("./$.def");$def($def.P,"String",{includes:function includes(searchString){if(cof(searchString)=="RegExp")throw TypeError();return!!~String($.assertDefined(this)).indexOf(searchString,arguments[1])}})},{"./$":16,"./$.cof":6,"./$.def":11}],55:[function(require,module,exports){var set=require("./$").set,at=require("./$.string-at")(true),ITER=require("./$.uid").safe("iter"),$iter=require("./$.iter"),step=$iter.step;$iter.std(String,"String",function(iterated){set(this,ITER,{o:String(iterated),i:0})},function(){var iter=this[ITER],O=iter.o,index=iter.i,point;if(index>=O.length)return step(1);point=at.call(O,index);iter.i+=point.length;return step(0,point)})},{"./$":16,"./$.iter":15,"./$.string-at":23,"./$.uid":25}],56:[function(require,module,exports){var $=require("./$"),$def=require("./$.def");$def($def.S,"String",{raw:function raw(callSite){var tpl=$.toObject(callSite.raw),len=$.toLength(tpl.length),sln=arguments.length,res=[],i=0;while(len>i){res.push(String(tpl[i++]));if(i<sln)res.push(String(arguments[i]))}return res.join("")}})},{"./$":16,"./$.def":11}],57:[function(require,module,exports){"use strict";var $=require("./$"),$def=require("./$.def");$def($def.P,"String",{repeat:function repeat(count){var str=String($.assertDefined(this)),res="",n=$.toInteger(count);if(n<0||n==Infinity)throw RangeError("Count can't be negative");for(;n>0;(n>>>=1)&&(str+=str))if(n&1)res+=str;return res}})},{"./$":16,"./$.def":11}],58:[function(require,module,exports){"use strict";var $=require("./$"),cof=require("./$.cof"),$def=require("./$.def");$def($def.P,"String",{startsWith:function startsWith(searchString){if(cof(searchString)=="RegExp")throw TypeError();var that=String($.assertDefined(this)),index=$.toLength(Math.min(arguments[1],that.length));searchString+="";return that.slice(index,index+searchString.length)===searchString}})},{"./$":16,"./$.cof":6,"./$.def":11}],59:[function(require,module,exports){"use strict";var $=require("./$"),setTag=require("./$.cof").set,uid=require("./$.uid"),$def=require("./$.def"),keyOf=require("./$.keyof"),has=$.has,hide=$.hide,getNames=$.getNames,toObject=$.toObject,Symbol=$.g.Symbol,Base=Symbol,setter=false,TAG=uid.safe("tag"),SymbolRegistry={},AllSymbols={};function wrap(tag){var sym=AllSymbols[tag]=$.set($.create(Symbol.prototype),TAG,tag);$.DESC&&setter&&$.setDesc(Object.prototype,tag,{configurable:true,set:function(value){hide(this,tag,value)}});return sym}if(!$.isFunction(Symbol)){Symbol=function Symbol(description){if(this instanceof Symbol)throw TypeError("Symbol is not a constructor");return wrap(uid(description))};hide(Symbol.prototype,"toString",function(){return this[TAG]})}$def($def.G+$def.W,{Symbol:Symbol});var symbolStatics={"for":function(key){return has(SymbolRegistry,key+="")?SymbolRegistry[key]:SymbolRegistry[key]=Symbol(key)},keyFor:function keyFor(key){return keyOf(SymbolRegistry,key)},pure:uid.safe,set:$.set,useSetter:function(){setter=true},useSimple:function(){setter=false}};$.each.call(("hasInstance,isConcatSpreadable,iterator,match,replace,search,"+"species,split,toPrimitive,toStringTag,unscopables").split(","),function(it){var sym=require("./$.wks")(it);symbolStatics[it]=Symbol===Base?sym:wrap(sym)});setter=true;$def($def.S,"Symbol",symbolStatics);$def($def.S+$def.F*(Symbol!=Base),"Object",{getOwnPropertyNames:function getOwnPropertyNames(it){var names=getNames(toObject(it)),result=[],key,i=0;while(names.length>i)has(AllSymbols,key=names[i++])||result.push(key);return result},getOwnPropertySymbols:function getOwnPropertySymbols(it){var names=getNames(toObject(it)),result=[],key,i=0;while(names.length>i)has(AllSymbols,key=names[i++])&&result.push(AllSymbols[key]);return result}});setTag(Symbol,"Symbol");setTag(Math,"Math",true);setTag($.g.JSON,"JSON",true)},{"./$":16,"./$.cof":6,"./$.def":11,"./$.keyof":17,"./$.uid":25,"./$.wks":27}],60:[function(require,module,exports){"use strict";var $=require("./$"),weak=require("./$.collection-weak"),leakStore=weak.leakStore,ID=weak.ID,WEAK=weak.WEAK,has=$.has,isObject=$.isObject,isFrozen=Object.isFrozen||$.core.Object.isFrozen,tmp={};var WeakMap=require("./$.collection")("WeakMap",{get:function get(key){if(isObject(key)){if(isFrozen(key))return leakStore(this).get(key);if(has(key,WEAK))return key[WEAK][this[ID]]}},set:function set(key,value){return weak.def(this,key,value)}},weak,true,true);if($.FW&&(new WeakMap).set((Object.freeze||Object)(tmp),7).get(tmp)!=7){$.each.call(["delete","has","get","set"],function(key){var method=WeakMap.prototype[key];WeakMap.prototype[key]=function(a,b){if(isObject(a)&&isFrozen(a)){var result=leakStore(this)[key](a,b);return key=="set"?this:result}return method.call(this,a,b)}})}},{"./$":16,"./$.collection":9,"./$.collection-weak":8}],61:[function(require,module,exports){"use strict";var weak=require("./$.collection-weak");require("./$.collection")("WeakSet",{add:function add(value){return weak.def(this,value,true)}},weak,false,true)},{"./$.collection":9,"./$.collection-weak":8}],62:[function(require,module,exports){var $def=require("./$.def");$def($def.P,"Array",{includes:require("./$.array-includes")(true)});require("./$.unscope")("includes")},{"./$.array-includes":2,"./$.def":11,"./$.unscope":26}],63:[function(require,module,exports){var $=require("./$"),$def=require("./$.def"),ownKeys=require("./$.own-keys");$def($def.S,"Object",{getOwnPropertyDescriptors:function getOwnPropertyDescriptors(object){var O=$.toObject(object),result={};$.each.call(ownKeys(O),function(key){$.setDesc(result,key,$.desc(0,$.getDesc(O,key)))});return result}})},{"./$":16,"./$.def":11,"./$.own-keys":18}],64:[function(require,module,exports){var $=require("./$"),$def=require("./$.def");function createObjectToArray(isEntries){return function(object){var O=$.toObject(object),keys=$.getKeys(object),length=keys.length,i=0,result=Array(length),key;if(isEntries)while(length>i)result[i]=[key=keys[i++],O[key]];else while(length>i)result[i]=O[keys[i++]];return result}}$def($def.S,"Object",{values:createObjectToArray(false),entries:createObjectToArray(true)})},{"./$":16,"./$.def":11}],65:[function(require,module,exports){var $def=require("./$.def");$def($def.S,"RegExp",{escape:require("./$.replacer")(/([\\\-[\]{}()*+?.,^$|])/g,"\\$1",true)})},{"./$.def":11,"./$.replacer":20}],66:[function(require,module,exports){var $def=require("./$.def"),forOf=require("./$.iter").forOf;$def($def.P,"Set",{toJSON:function(){var arr=[];forOf(this,false,arr.push,arr);return arr}})},{"./$.def":11,"./$.iter":15}],67:[function(require,module,exports){var $def=require("./$.def");$def($def.P,"String",{at:require("./$.string-at")(true)})},{"./$.def":11,"./$.string-at":23}],68:[function(require,module,exports){var $=require("./$"),$def=require("./$.def"),$Array=$.core.Array||Array,statics={};function setStatics(keys,length){$.each.call(keys.split(","),function(key){if(length==undefined&&key in $Array)statics[key]=$Array[key];else if(key in[])statics[key]=require("./$.ctx")(Function.call,[][key],length)})}setStatics("pop,reverse,shift,keys,values,entries",1);setStatics("indexOf,every,some,forEach,map,filter,find,findIndex,includes",3);setStatics("join,slice,concat,push,splice,unshift,sort,lastIndexOf,"+"reduce,reduceRight,copyWithin,fill,turn");$def($def.S,"Array",statics)},{"./$":16,"./$.ctx":10,"./$.def":11}],69:[function(require,module,exports){require("./es6.array.iterator");var $=require("./$"),Iterators=require("./$.iter").Iterators,ITERATOR=require("./$.wks")("iterator"),NodeList=$.g.NodeList;if($.FW&&NodeList&&!(ITERATOR in NodeList.prototype)){$.hide(NodeList.prototype,ITERATOR,Iterators.Array)}Iterators.NodeList=Iterators.Array},{"./$":16,"./$.iter":15,"./$.wks":27,"./es6.array.iterator":34}],70:[function(require,module,exports){var $def=require("./$.def"),$task=require("./$.task");$def($def.G+$def.B,{setImmediate:$task.set,clearImmediate:$task.clear})},{"./$.def":11,"./$.task":24}],71:[function(require,module,exports){var $=require("./$"),$def=require("./$.def"),invoke=require("./$.invoke"),partial=require("./$.partial"),MSIE=!!$.g.navigator&&/MSIE .\./.test(navigator.userAgent);function wrap(set){return MSIE?function(fn,time){return set(invoke(partial,[].slice.call(arguments,2),$.isFunction(fn)?fn:Function(fn)),time)}:set}$def($def.G+$def.B+$def.F*MSIE,{setTimeout:wrap($.g.setTimeout),setInterval:wrap($.g.setInterval)})},{"./$":16,"./$.def":11,"./$.invoke":13,"./$.partial":19}],72:[function(require,module,exports){require("./modules/es5");require("./modules/es6.symbol");require("./modules/es6.object.assign");require("./modules/es6.object.is");require("./modules/es6.object.set-prototype-of");require("./modules/es6.object.to-string");require("./modules/es6.object.statics-accept-primitives");require("./modules/es6.function.name");require("./modules/es6.number.constructor");require("./modules/es6.number.statics");require("./modules/es6.math");require("./modules/es6.string.from-code-point");require("./modules/es6.string.raw");require("./modules/es6.string.iterator");require("./modules/es6.string.code-point-at");require("./modules/es6.string.ends-with");require("./modules/es6.string.includes");require("./modules/es6.string.repeat");require("./modules/es6.string.starts-with");require("./modules/es6.array.from");require("./modules/es6.array.of");require("./modules/es6.array.iterator");require("./modules/es6.array.species");require("./modules/es6.array.copy-within");require("./modules/es6.array.fill");require("./modules/es6.array.find");require("./modules/es6.array.find-index");require("./modules/es6.regexp");require("./modules/es6.promise");require("./modules/es6.map");require("./modules/es6.set");require("./modules/es6.weak-map");require("./modules/es6.weak-set");require("./modules/es6.reflect");require("./modules/es7.array.includes");require("./modules/es7.string.at");require("./modules/es7.regexp.escape");require("./modules/es7.object.get-own-property-descriptors");require("./modules/es7.object.to-array");require("./modules/es7.set.to-json");require("./modules/js.array.statics");require("./modules/web.timers");require("./modules/web.immediate");require("./modules/web.dom.iterable");module.exports=require("./modules/$").core},{"./modules/$":16,"./modules/es5":28,"./modules/es6.array.copy-within":29,"./modules/es6.array.fill":30,"./modules/es6.array.find":32,"./modules/es6.array.find-index":31,"./modules/es6.array.from":33,"./modules/es6.array.iterator":34,"./modules/es6.array.of":35,"./modules/es6.array.species":36,"./modules/es6.function.name":37,"./modules/es6.map":38,"./modules/es6.math":39,"./modules/es6.number.constructor":40,"./modules/es6.number.statics":41,"./modules/es6.object.assign":42,"./modules/es6.object.is":43,"./modules/es6.object.set-prototype-of":44,"./modules/es6.object.statics-accept-primitives":45,"./modules/es6.object.to-string":46,"./modules/es6.promise":47,"./modules/es6.reflect":48,"./modules/es6.regexp":49,"./modules/es6.set":50,"./modules/es6.string.code-point-at":51,"./modules/es6.string.ends-with":52,"./modules/es6.string.from-code-point":53,"./modules/es6.string.includes":54,"./modules/es6.string.iterator":55,"./modules/es6.string.raw":56,"./modules/es6.string.repeat":57,"./modules/es6.string.starts-with":58,"./modules/es6.symbol":59,"./modules/es6.weak-map":60,"./modules/es6.weak-set":61,"./modules/es7.array.includes":62,"./modules/es7.object.get-own-property-descriptors":63,"./modules/es7.object.to-array":64,"./modules/es7.regexp.escape":65,"./modules/es7.set.to-json":66,"./modules/es7.string.at":67,"./modules/js.array.statics":68,"./modules/web.dom.iterable":69,"./modules/web.immediate":70,"./modules/web.timers":71}],73:[function(require,module,exports){(function(global){!function(global){"use strict";var hasOwn=Object.prototype.hasOwnProperty;var undefined;var iteratorSymbol=typeof Symbol==="function"&&Symbol.iterator||"@@iterator";var inModule=typeof module==="object";var runtime=global.regeneratorRuntime;if(runtime){if(inModule){module.exports=runtime}return}runtime=global.regeneratorRuntime=inModule?module.exports:{};function wrap(innerFn,outerFn,self,tryLocsList){var generator=Object.create((outerFn||Generator).prototype);generator._invoke=makeInvokeMethod(innerFn,self||null,new Context(tryLocsList||[]));return generator}runtime.wrap=wrap;function tryCatch(fn,obj,arg){try{return{type:"normal",arg:fn.call(obj,arg)}}catch(err){return{type:"throw",arg:err}}}var GenStateSuspendedStart="suspendedStart";var GenStateSuspendedYield="suspendedYield";var GenStateExecuting="executing";var GenStateCompleted="completed";var ContinueSentinel={};function Generator(){}function GeneratorFunction(){}function GeneratorFunctionPrototype(){}var Gp=GeneratorFunctionPrototype.prototype=Generator.prototype;GeneratorFunction.prototype=Gp.constructor=GeneratorFunctionPrototype;GeneratorFunctionPrototype.constructor=GeneratorFunction;GeneratorFunction.displayName="GeneratorFunction";runtime.isGeneratorFunction=function(genFun){var ctor=typeof genFun==="function"&&genFun.constructor;return ctor?ctor===GeneratorFunction||(ctor.displayName||ctor.name)==="GeneratorFunction":false};runtime.mark=function(genFun){genFun.__proto__=GeneratorFunctionPrototype;genFun.prototype=Object.create(Gp);return genFun};runtime.async=function(innerFn,outerFn,self,tryLocsList){return new Promise(function(resolve,reject){var generator=wrap(innerFn,outerFn,self,tryLocsList);var callNext=step.bind(generator,"next");var callThrow=step.bind(generator,"throw");function step(method,arg){var record=tryCatch(generator[method],generator,arg);if(record.type==="throw"){reject(record.arg);return}var info=record.arg;if(info.done){resolve(info.value)}else{Promise.resolve(info.value).then(callNext,callThrow)}}callNext()})};function makeInvokeMethod(innerFn,self,context){var state=GenStateSuspendedStart;return function invoke(method,arg){if(state===GenStateExecuting){throw new Error("Generator is already running")}if(state===GenStateCompleted){return doneResult()}while(true){var delegate=context.delegate;if(delegate){if(method==="return"||method==="throw"&&delegate.iterator.throw===undefined){context.delegate=null;var returnMethod=delegate.iterator.return;if(returnMethod){var record=tryCatch(returnMethod,delegate.iterator,arg);if(record.type==="throw"){method="throw";arg=record.arg;continue}}if(method==="return"){continue}}var record=tryCatch(delegate.iterator[method],delegate.iterator,arg);if(record.type==="throw"){context.delegate=null;method="throw";arg=record.arg;continue}method="next";arg=undefined;var info=record.arg;if(info.done){context[delegate.resultName]=info.value;context.next=delegate.nextLoc}else{state=GenStateSuspendedYield;return info}context.delegate=null}if(method==="next"){if(state===GenStateSuspendedYield){context.sent=arg}else{delete context.sent}}else if(method==="throw"){if(state===GenStateSuspendedStart){state=GenStateCompleted;throw arg}if(context.dispatchException(arg)){method="next";arg=undefined}}else if(method==="return"){context.abrupt("return",arg)}state=GenStateExecuting;var record=tryCatch(innerFn,self,context);if(record.type==="normal"){state=context.done?GenStateCompleted:GenStateSuspendedYield;var info={value:record.arg,done:context.done};if(record.arg===ContinueSentinel){if(context.delegate&&method==="next"){arg=undefined}}else{return info}}else if(record.type==="throw"){state=GenStateCompleted;method="throw";arg=record.arg}}}}function defineGeneratorMethod(method){Gp[method]=function(arg){return this._invoke(method,arg)}}defineGeneratorMethod("next");defineGeneratorMethod("throw");defineGeneratorMethod("return");Gp[iteratorSymbol]=function(){return this};Gp.toString=function(){return"[object Generator]"};function pushTryEntry(locs){var entry={tryLoc:locs[0]};if(1 in locs){entry.catchLoc=locs[1]}if(2 in locs){entry.finallyLoc=locs[2];entry.afterLoc=locs[3]}this.tryEntries.push(entry)}function resetTryEntry(entry){var record=entry.completion||{};record.type="normal";delete record.arg;entry.completion=record}function Context(tryLocsList){this.tryEntries=[{tryLoc:"root"}];tryLocsList.forEach(pushTryEntry,this);this.reset()}runtime.keys=function(object){var keys=[];for(var key in object){keys.push(key)}keys.reverse();return function next(){while(keys.length){var key=keys.pop();if(key in object){next.value=key;next.done=false;return next}}next.done=true;return next}};function values(iterable){if(iterable){var iteratorMethod=iterable[iteratorSymbol];if(iteratorMethod){return iteratorMethod.call(iterable)}if(typeof iterable.next==="function"){return iterable}if(!isNaN(iterable.length)){var i=-1,next=function next(){while(++i<iterable.length){if(hasOwn.call(iterable,i)){next.value=iterable[i];next.done=false;return next}}next.value=undefined;next.done=true;return next};return next.next=next}}return{next:doneResult}}runtime.values=values;function doneResult(){return{value:undefined,done:true}}Context.prototype={constructor:Context,reset:function(){this.prev=0;

this.next=0;this.sent=undefined;this.done=false;this.delegate=null;this.tryEntries.forEach(resetTryEntry);for(var tempIndex=0,tempName;hasOwn.call(this,tempName="t"+tempIndex)||tempIndex<20;++tempIndex){this[tempName]=null}},stop:function(){this.done=true;var rootEntry=this.tryEntries[0];var rootRecord=rootEntry.completion;if(rootRecord.type==="throw"){throw rootRecord.arg}return this.rval},dispatchException:function(exception){if(this.done){throw exception}var context=this;function handle(loc,caught){record.type="throw";record.arg=exception;context.next=loc;return!!caught}for(var i=this.tryEntries.length-1;i>=0;--i){var entry=this.tryEntries[i];var record=entry.completion;if(entry.tryLoc==="root"){return handle("end")}if(entry.tryLoc<=this.prev){var hasCatch=hasOwn.call(entry,"catchLoc");var hasFinally=hasOwn.call(entry,"finallyLoc");if(hasCatch&&hasFinally){if(this.prev<entry.catchLoc){return handle(entry.catchLoc,true)}else if(this.prev<entry.finallyLoc){return handle(entry.finallyLoc)}}else if(hasCatch){if(this.prev<entry.catchLoc){return handle(entry.catchLoc,true)}}else if(hasFinally){if(this.prev<entry.finallyLoc){return handle(entry.finallyLoc)}}else{throw new Error("try statement without catch or finally")}}}},abrupt:function(type,arg){for(var i=this.tryEntries.length-1;i>=0;--i){var entry=this.tryEntries[i];if(entry.tryLoc<=this.prev&&hasOwn.call(entry,"finallyLoc")&&this.prev<entry.finallyLoc){var finallyEntry=entry;break}}if(finallyEntry&&(type==="break"||type==="continue")&&finallyEntry.tryLoc<=arg&&arg<finallyEntry.finallyLoc){finallyEntry=null}var record=finallyEntry?finallyEntry.completion:{};record.type=type;record.arg=arg;if(finallyEntry){this.next=finallyEntry.finallyLoc}else{this.complete(record)}return ContinueSentinel},complete:function(record,afterLoc){if(record.type==="throw"){throw record.arg}if(record.type==="break"||record.type==="continue"){this.next=record.arg}else if(record.type==="return"){this.rval=record.arg;this.next="end"}else if(record.type==="normal"&&afterLoc){this.next=afterLoc}return ContinueSentinel},finish:function(finallyLoc){for(var i=this.tryEntries.length-1;i>=0;--i){var entry=this.tryEntries[i];if(entry.finallyLoc===finallyLoc){return this.complete(entry.completion,entry.afterLoc)}}},"catch":function(tryLoc){for(var i=this.tryEntries.length-1;i>=0;--i){var entry=this.tryEntries[i];if(entry.tryLoc===tryLoc){var record=entry.completion;if(record.type==="throw"){var thrown=record.arg;resetTryEntry(entry)}return thrown}}throw new Error("illegal catch attempt")},delegateYield:function(iterable,resultName,nextLoc){this.delegate={iterator:values(iterable),resultName:resultName,nextLoc:nextLoc};return ContinueSentinel}}}(typeof global==="object"?global:typeof window==="object"?window:typeof self==="object"?self:this)}).call(this,typeof global!=="undefined"?global:typeof self!=="undefined"?self:typeof window!=="undefined"?window:{})},{}]},{},[1]);
define("../js/lib/browser-polyfill.js", function(){});


require(["main"]);

//# sourceMappingURL=app.js.map