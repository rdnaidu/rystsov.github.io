(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

module.exports = {
    Statement: Statement,
    Abort: Abort,
    Seq: Seq,
    Cond: Cond,
    Fun: Fun,
    Call: Call,
    Call2: Call2,
    Return: Return,
    Each: Each,
    Nope: Nope,
    Shift: Shift,
    Skip: Skip,
    Defer: Defer,
    While: While,
    Wormhole: Wormhole,
    Marked: Marked,
    TryCatch: TryCatch,
    Throw: ThrowAst,
    flow: {
        Throw: Throw,
        Unit: Unit
    }
};

var hl2 = require("./monokai");

/////////////////////

function Step(pre, action, post) {
    return {
        isStep: true,
        pre: pre,
        post: post,
        get_action: function get_action() {
            return action;
        },
        bind: function bind(g) {
            return Step(this.pre, function (ctx) {
                var phase = action(ctx);
                return Phase(phase.step.bind(g), phase.ctx);
            }.bind(this), this.post);
        }
    };
}

function Jump(action) {
    return {
        isJump: true,
        get_action: function get_action() {
            return action;
        },
        bind: function bind(g) {
            return Jump(function (ctx) {
                var phase = action(ctx);
                return Phase(phase.step.bind(g), phase.ctx);
            });
        }
    };
}

function Throw(obj) {
    return {
        isThrow: true,
        obj: obj,
        bind: function bind(g) {
            if (g.isCatch) {
                return g.caught(this.obj).bind(g.tail);
            } else {
                return this;
            }
        }
    };
}

function Catch(caught, tail) {
    return {
        isCatch: true,
        caught: caught,
        tail: tail,
        extract: function extract() {
            return tail;
        },
        bind: function bind(g) {
            return Catch(caught, this.tail.bind(g));
        }
    };
}

// TODO: implement via try/catch
function AsReturn(step) {
    return {
        isReturn: true,
        step: step,
        bind: function bind(g) {
            if (!g.isAccept) return this;
            return step.bind(g.step);
        }
    };
}

function AsAccept(step) {
    return {
        isAccept: true,
        step: step,
        extract: function extract() {
            return step;
        },
        bind: function bind(g) {
            return AsAccept(step.bind(g));
        }
    };
}

function Unit() {
    return {
        isUnit: true,
        bind: function bind(g) {
            return g;
        }
    };
}

function Zero() {
    return {
        isZero: true,
        bind: function bind(g) {
            return this;
        }
    };
}

function Phase(step, ctx) {
    return {
        step: step,
        ctx: ctx
    };
}

/////////////////////

function bind(f, g) {
    return f.bind(g);
}

function _unit(x) {
    return x.unit();
}

/////////////////////

function none() {}

function marker(x) {
    return function (thread) {
        if (!x.marked.hasOwnProperty(thread.id)) {
            x.marked[thread.thread_id] = {
                thread: thread,
                hits: []
            };
        }
        x.marked[thread.thread_id].hits.push(thread.ts);
        thread.trace[thread.ts] = x;
    };
}

function unmarker(x) {
    return function (thread) {
        var ts = x.marked[thread.thread_id].hits.pop();
        if (x.marked[thread.thread_id].hits.length == 0) {
            delete x.marked[thread.thread_id];
        }
        delete thread.trace[ts];
    };
}

/////////////////////

// Move to ast.*

// TODO: remove
function Wormhole() {
    this.pres = [];
    this.posts = [];
    this.pre = function () {
        this.pres.forEach(function (x) {
            x();
        });
    };
    this.post = function () {
        this.posts.forEach(function (x) {
            x();
        });
    };
    this.reg = function (stmnt) {
        var wh = this;
        var step = stmnt.unit();
        this.pres.push(step.pre);
        this.posts.push(step.post);
        step.unit = function () {
            return Step(wh.pre.bind(wh), step.action, wh.post.bind(wh));
        };
        return step;
    };
}

function Statement(view, action) {
    var self = {
        view: view,
        action: action,
        marked: {},
        unit: function unit() {
            return Step(marker(self), function (ctx) {
                action(ctx);
                return Phase(Unit(), ctx);
            }, unmarker(self));
        },
        accept_writer: function accept_writer(offset, writer, shift) {
            writer.write(self.marked, offset, self.view);
            return writer;
        }
    };
    return self;
}

function Marked(label, body) {
    var self = {
        label: label,
        unit: function unit() {
            return body.unit();
        },
        accept_writer: function accept_writer(offset, writer, shift) {
            writer.begin_marked(label);
            body.accept_writer(offset, writer, shift);
            writer.end_marked();
            return writer;
        }
    };
    return self;
}

function Skip(action) {
    var self = {
        action: action,
        unit: function unit() {
            return Jump(function (ctx) {
                action(ctx);
                return Phase(Unit(), ctx);
            });
        },
        accept_writer: function accept_writer(offset, writer, shift) {
            return writer;
        }
    };
    return self;
}

function Defer(action) {
    var self = {
        action: action,
        unit: function unit() {
            return Jump(function (ctx) {
                var _action = action(ctx);

                var _action2 = _slicedToArray(_action, 2);

                var step = _action2[0];
                var state = _action2[1];

                return Phase(step, state);
            });
        },
        accept_writer: function accept_writer(offset, writer, shift) {
            return writer;
        }
    };
    return self;
}

function TryCatch(try_view, expression, catch_view, pack, handler, end) {
    var self = {
        try_view: try_view,
        expression: expression,
        catch_view: catch_view,
        pack: pack,
        handler: handler,
        end: end,
        marked: {},
        unit: function unit() {
            var call = Step(marker(self), function (ctx) {
                return Phase(expression.unit(), ctx);
            }, unmarker(self));

            var catcher = Catch(function (obj) {
                return Jump(function (ctx) {
                    pack(ctx, obj);
                    return Phase(self.handler.unit(), ctx);
                });
            }, Unit());

            return call.bind(catcher);
        },
        accept_writer: function accept_writer(offset, writer, shift) {
            writer.write(self.marked, offset, try_view);
            self.expression.accept_writer(offset + shift, writer, shift);
            writer.write(self.marked, offset, catch_view);
            self.handler.accept_writer(offset + shift, writer, shift);
            writer.write(self.marked, offset, end);
            return writer;
        }
    };
    return self;
}

function Return(view, selector) {
    var self = {
        view: view,
        selector: selector,
        marked: {},
        unit: function unit() {
            return AsReturn(Step(marker(self), function (ctx) {
                ctx.__ret = self.selector(ctx);
                return Phase(Unit(), ctx);
            }, unmarker(self)));
        },
        accept_writer: function accept_writer(offset, writer, shift) {
            writer.write(self.marked, offset, self.view);
            return writer;
        }
    };
    return self;
}

function ThrowAst(view, selector) {
    var self = {
        view: view,
        selector: selector,
        marked: {},
        unit: function unit() {
            return Step(marker(self), function (ctx) {
                var obj = selector(ctx);
                return Phase(Throw(obj), ctx);
            }, unmarker(self));
        },
        accept_writer: function accept_writer(offset, writer, shift) {
            writer.write(self.marked, offset, self.view);
            return writer;
        }
    };
    return self;
}

// TODO: remove in favor of Throw
function Abort(view) {
    var self = {
        marked: {},
        view: view,
        unit: function unit() {
            return Step(marker(self), function (ctx) {
                return Phase(Zero(), ctx);
            }, unmarker(self));
        },
        accept_writer: function accept_writer(offset, writer, shift) {
            writer.write(self.marked, offset, view);
            return writer;
        }
    };
    return self;
}

function Seq(statements) {
    var self = {
        statements: statements,
        unit: function unit() {
            return self.statements.map(_unit).reduce(bind, Unit());
        },
        accept_writer: function accept_writer(offset, writer, shift) {
            for (var i = 0; i < self.statements.length; i++) {
                self.statements[i].accept_writer(offset, writer, shift);
            }
            return writer;
        }
    };
    return self;
}

function Cond(cond_view, predicate, body, alt) {
    var self = {
        cond_view: cond_view,
        predicate: predicate,
        body: body,
        alt: alt,
        marked: {},
        unit: function unit() {
            return Step(marker(self), function (ctx) {
                if (predicate(ctx)) {
                    return Phase(body.unit(), ctx);
                } else {
                    if (alt) {
                        return Phase(alt.unit(), ctx);
                    } else {
                        return Phase(Unit(), ctx);
                    }
                }
            }, unmarker(self));
        },
        accept_writer: function accept_writer(offset, writer, shift) {
            writer.write(self.marked, offset, hl2("if (" + cond_view + ") {"));
            body.accept_writer(offset + shift, writer, shift);
            if (alt) {
                writer.write(false, offset, hl2("} else {"));
                alt.accept_writer(offset + shift, writer, shift);
                writer.write(false, offset, "}");
            } else {
                writer.write(false, offset, "}");
            }
            return writer;
        }
    };
    return self;
}

function Fun(begin, body, end) {
    var self = {
        signature: begin,
        body: body,
        end: end,
        unit: function unit() {
            return Unit();
        },
        accept_writer: function accept_writer(offset, writer, shift) {
            writer.write(false, offset, begin);
            body.accept_writer(offset + shift, writer, shift);
            writer.write(false, offset, end);
            return writer;
        }
    };
    return self;
}

function While(view_begin, pred, body, view_end) {
    var self = {
        marked: {},
        unit: function unit() {
            return Step(marker(self), function (ctx) {
                if (pred(ctx)) {
                    return Phase(body.unit().bind(self.unit()), ctx);
                } else {
                    return Phase(Unit(), ctx);
                }
            }, unmarker(self));
        },
        accept_writer: function accept_writer(offset, writer, shift) {
            writer.write(self.marked, offset, view_begin);
            body.accept_writer(offset + shift, writer, shift);
            writer.write(self.marked, offset, view_end);
        }
    };
    return self;
}

function Each(selector, pack, begin, body, end) {
    var self = {
        selector: selector,
        pack: pack,
        begin: begin,
        body: body,
        end: end,
        marked: {},
        unit: function unit() {
            return Step(marker(self), function (ctx) {
                var xs = selector(ctx);
                var arr = [];
                xs.forEach(function (x) {
                    arr.push(x);
                });
                if (xs.length == 0) {
                    return Phase(Unit(), ctx);
                } else {
                    var tail = Jump(function (ctx) {
                        ctx.__thread.pop_frame();
                        return Phase(Unit(), ctx);
                    }).bind(Step(marker(self), function (ctx) {
                        return Phase(Unit(), ctx.__seed);
                    }, unmarker(self)));
                    for (var i = xs.length - 1; i >= 0; i--) {
                        tail = function (item) {
                            var repack = Jump(function (ctx) {
                                ctx.__thread.pop_frame();
                                var packed = pack(item);
                                packed.__thread = ctx.__thread;
                                packed.__seed = ctx.__seed;
                                ctx.__thread.push_frame();
                                return Phase(Unit(), packed);
                            });
                            return repack.bind(body.unit()).bind(tail);
                        }(xs[i]);
                    }
                    ctx.__thread.push_frame();
                    return Phase(tail, { __seed: ctx, __thread: ctx.__thread });
                }
            }, unmarker(self));
        },
        accept_writer: function accept_writer(offset, writer, shift) {
            writer.write(self.marked, offset, begin);
            body.accept_writer(offset + shift, writer, shift);
            writer.write(self.marked, offset, end);
            return writer;
        }
    };

    return self;
}

// TODO: replace with Call2
function Call(view, pack, fun, unpack) {
    var self = {
        view: view,
        pack: pack,
        fun: fun,
        unpack: unpack,
        marked: {},
        unit: function unit() {
            var call = Step(marker(self), function (ctx) {
                ctx.__thread.push_frame();
                var sub = pack(ctx);
                sub.__seed = ctx;
                sub.__fun = fun;
                sub.__thread = ctx.__thread;
                return Phase(fun.body.unit(), sub);
            }, none);
            var accept = AsAccept(Jump(function (ctx) {
                var seed = ctx.__seed;
                var ret = ctx.__ret;
                ctx.__thread.pop_frame();
                unpack(seed, ret);
                return Phase(Unit(), seed);
            }));
            var pause = Step(none, function (ctx) {
                return Phase(Unit(), ctx);
            }, unmarker(self));
            var catcher = Catch(function (obj) {
                return Jump(function (ctx) {
                    unmarker(self)(ctx.__thread);
                    ctx.__thread.pop_frame();
                    return Phase(Throw(obj), ctx.__seed);
                });
            }, Unit());
            return call.bind(accept).bind(pause).bind(catcher);
        },
        accept_writer: function accept_writer(offset, writer, shift) {
            writer.write(self.marked, offset, view);
            return writer;
        }
    };
    return self;
}

function Call2(view, pack, fun, unpack) {
    var self = {
        view: view,
        pack: pack,
        fun: fun,
        unpack: unpack,
        marked: {},
        unit: function unit() {
            var call = Step(marker(self), function (ctx) {
                var fun = self.fun(ctx);
                ctx.__thread.push_frame();
                var sub = pack(ctx);
                sub.__seed = ctx;
                sub.__fun = fun;
                sub.__thread = ctx.__thread;
                return Phase(fun.body.unit(), sub);
            }, none);
            var accept = AsAccept(Jump(function (ctx) {
                var seed = ctx.__seed;
                var ret = ctx.__ret;
                ctx.__thread.pop_frame();
                unpack(seed, ret);
                return Phase(Unit(), seed);
            }));
            var pause = Step(none, function (ctx) {
                return Phase(Unit(), ctx);
            }, unmarker(self));
            var catcher = Catch(function (obj) {
                return Jump(function (ctx) {
                    unmarker(self)(ctx.__thread);
                    ctx.__thread.pop_frame();
                    return Phase(Throw(obj), ctx.__seed);
                });
            }, Unit());
            return call.bind(accept).bind(pause).bind(catcher);
        },
        accept_writer: function accept_writer(offset, writer, shift) {
            writer.write(self.marked, offset, view);
            return writer;
        }
    };

    return self;
}

function Nope(view) {
    var self = {
        view: view,
        unit: function unit() {
            return Unit();
        },
        accept_writer: function accept_writer(offset, writer, shift) {
            writer.write(false, offset, view);
            return writer;
        }
    };
    return self;
}

function Shift(body) {
    var self = {
        body: body,
        unit: function unit() {
            return Unit();
        },
        accept_writer: function accept_writer(offset, writer, shift) {
            body.accept_writer(offset + shift, writer, shift);
            return writer;
        }
    };
    return self;
}

},{"./monokai":3}],2:[function(require,module,exports){
"use strict";

module.exports = {
    ThreadModel: ThreadModel,
    AppModel: AppModel,
    HashVar: HashVar
};

function HashVar(obj) {
    this.obj = obj;
}

function ThreadModel(entry_point, app_model, thread_id, h, s) {
    var self = {
        thread_id: thread_id,
        is_active: false,
        was_active: false,
        was_aborted: false,
        app_model: app_model,
        thread: entry_point,
        color: { h: h, s: s },
        ts: 0,
        trace: {},
        step: {},
        data: {},

        push_frame: function push_frame() {
            self.app_model.push_frame(self);
        },
        pop_frame: function pop_frame() {
            self.app_model.pop_frame(self);
        },
        frame_var: function frame_var(name, obj) {
            self.app_model.frame_var(self, name, obj);
        },
        init: function init() {
            self.was_active = true;
            self.was_aborted = false;
            self.step = self.thread.unit();
            self.ctx = {
                __thread: self
            };

            while (self.step.isJump || self.step.isAccept || self.step.isCatch) {
                while (self.step.isJump) {
                    var phase = self.step.get_action()(self.ctx);
                    self.ctx = phase.ctx;
                    self.step = phase.step;
                }
                if (self.step.isAccept || self.step.isCatch) {
                    self.step = self.step.extract();
                }
            }

            if (self.step.isStep) {
                self.ts += 1;
                self.is_active = true;
                self.step.pre(self);
            }
            self.app_model.ticked(self);
        },
        unselect: function unselect() {
            var trace = [];
            for (var ts in self.trace) {
                if (!self.trace.hasOwnProperty(ts)) {
                    continue;
                }
                trace.push(ts);
            }
            trace.forEach(function (ts) {
                delete self.trace[ts].marked[self.thread_id];
                delete self.trace[ts];
            });
        },
        abort: function abort() {
            self.unselect();
            self.was_aborted = true;
            self.is_active = false;
            self.ctx = {
                __thread: self
            };
            self.app_model.clear_frames(self);
            self.app_model.ticked(self);
        },
        iter: function iter() {
            if (self.step.isStep) {
                var phase = self.step.get_action()(self.ctx);
                self.step.post(self);
                self.ctx = phase.ctx;
                self.step = phase.step;
                while (self.step.isJump || self.step.isAccept || self.step.isCatch) {
                    while (self.step.isJump) {
                        var phase = self.step.get_action()(self.ctx);
                        self.ctx = phase.ctx;
                        self.step = phase.step;
                    }
                    if (self.step.isAccept || self.step.isCatch) {
                        self.step = self.step.extract();
                    }
                }
            }
            if (self.step.isStep) {
                self.ts += 1;
                self.step.pre(self);
            } else {
                if (self.step.isZero) {
                    self.was_aborted = true;
                }
                self.is_active = false;
                self.unselect();
            }
            self.app_model.ticked(self);
        }
    };
    return self;
}

function AppModel() {
    var app_model = {
        on_state_updated: null,
        notify: function notify() {
            if (app_model.on_state_updated != null) {
                app_model.on_state_updated(app_model);
            }
        },
        frames: [],
        clear_frames: function clear_frames(thread) {
            this.frames = this.frames.filter(function (x) {
                return x.thread_id != thread.thread_id;
            });
        },
        push_frame: function push_frame(thread) {
            this.frames.push({
                thread_id: thread.thread_id,
                thread: thread,
                vars: []
            });
        },
        pop_frame: function pop_frame(thread) {
            var tail = [];
            while (true) {
                var frame = this.frames.pop();
                if (frame.thread_id == thread.thread_id) {
                    break;
                }
                tail.push(frame);
            }
            while (tail.length > 0) {
                this.frames.push(tail.pop());
            }
        },
        frame_var: function frame_var(thread, name, obj) {
            for (var i = this.frames.length - 1; i >= 0; i--) {
                if (this.frames[i].thread_id == thread.thread_id) {
                    this.frames[i].vars = this.frames[i].vars.filter(function (val) {
                        return name == null || val.name != name;
                    });
                    this.frames[i].vars.push({ name: name, obj: obj });
                    return;
                }
            }
            this.push_frame(thread);
            this.frame_var(thread, name, obj);
            //throw "WTF?!";
        },
        has_frames_var: function has_frames_var() {
            var count = 0;
            this.frames.forEach(function (frame) {
                count += frame.vars.length;
            });
            return count > 0;
        }
    };
    return app_model;
}

},{}],3:[function(require,module,exports){
"use strict";

module.exports = hl2;

var TML = require("../stepbystep/view").TML;

function hl2(text) {
    return html(text.replace(/"([^"]+)"/g, "<span class=\"string\">\"$1\"</span>").replace(/function ([^(]+)\(/g, "function <span class=\"fun-name\">$1</span>(").replace(/this.([^ ]+) = function/, "this.<span class=\"fun-name\">$1</span> = function").replace(/function/g, "<span class=\"function\">function</span>").replace(/([^a-z])(\d+)/g, "$1<span class=\"number\">$2</span>").replace(/return/g, "<span class=\"return\">return</span>").replace(/while/g, "<span class=\"while\">while</span>").replace(/if/g, "<span class=\"if\">if</span>").replace(/else/g, "<span class=\"else\">else</span>").replace(/try/g, "<span class=\"try\">try</span>").replace(/catch/g, "<span class=\"catch\">catch</span>").replace(/true/g, "<span class=\"bool\">true</span>").replace(/false/g, "<span class=\"bool\">false</span>").replace(/this/g, "<span class=\"this\">this</span>").replace(/var/g, "<span class=\"var\">var</span>"));
}

function html(text) {
    return TML.html(text);
}

},{"../stepbystep/view":4}],4:[function(require,module,exports){
"use strict";

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var TML = {};
TML.Click = function (x, f) {
    return { is_click: true, text: x, f: f };
};
TML.html = function (text) {
    return { is_html: true, text: text };
};

module.exports.TML = TML;

module.exports.CodeView = React.createClass({
    displayName: "CodeView",

    renderCodeDOMRawHTML: function renderCodeDOMRawHTML(codeDOM) {
        var shift = 4;
        if (this.props.shift) {
            shift = this.props.shift;
        }
        return codeDOM.accept_writer(0, HtmlCodeWriter(), shift).get(this.props.width);
    },
    render: function render() {
        return React.createElement(
            "div",
            { className: "codeView" },
            this.renderCodeDOMRawHTML(this.props.dom)
        );
    }
});

module.exports.buildShadesMap = buildShadesMap;

function buildShadesMap(set) {
    var tss = [];
    var ts_pos = {};
    for (var ts in set) {
        if (!set.hasOwnProperty(ts)) {
            continue;
        }
        if (!set[ts]) {
            continue;
        }
        tss.push(parseInt(ts));
    }
    tss = tss.sort(function (x, y) {
        return x - y;
    });
    for (var i = 0; i < tss.length; i++) {
        ts_pos[tss[i]] = (1.0 + i) / tss.length;
    }
    return ts_pos;
}

function HtmlCodeWriter() {
    var self = {
        line_group: {
            is_group: true,
            label: null,
            lines: [],
            prev: null
        },
        begin_marked: function begin_marked(label) {
            var prev = self.line_group;
            self.line_group = {
                is_group: true,
                label: label,
                lines: [],
                prev: prev
            };
        },
        end_marked: function end_marked() {
            var curr = self.line_group;
            self.line_group = curr.prev;
            self.line_group.lines.push(curr);
        },
        write: function write(marked, offset, line) {
            var off = repeat(" ", offset);

            var sink = [React.createElement(
                "span",
                null,
                off
            )];
            fill_with_tml(line, sink, off);
            line = sink;

            var h = 0;
            var s = 0;
            var a = 0.0;
            var c = 0;

            for (var thread_id in marked) {
                if (!marked.hasOwnProperty(thread_id)) {
                    continue;
                }
                var thread = marked[thread_id].thread;
                var ts_pos = buildShadesMap(thread.trace);
                var hit = -1;
                marked[thread_id].hits.forEach(function (x) {
                    hit = Math.max(hit, x);
                });
                if (hit != -1) {
                    h += thread.color.h;
                    s += thread.color.s;
                    a += ts_pos[hit];
                    c += 1;
                }
            }

            if (c > 0) {
                self.line_group.lines.push({
                    is_group: false,
                    is_current: true,
                    color: { h: Math.floor(h / c), s: Math.floor(s / c), a: a / c },
                    text: line
                });
            } else {
                self.line_group.lines.push({
                    is_group: false,
                    is_current: false,
                    text: line
                });
            }

            function fill_with_tml(element, sink, off) {
                if (typeof element == "string") {
                    sink.push(React.createElement(
                        "span",
                        null,
                        element.replace(/\n/g, "\n" + off)
                    ));
                    return;
                }
                if (Array.isArray(element)) {
                    element.forEach(function (item) {
                        fill_with_tml(item, sink, off);
                    });
                    return;
                }
                if ((typeof element === "undefined" ? "undefined" : _typeof(element)) == "object") {
                    if (element.is_html) {
                        sink.push(React.createElement("span", { dangerouslySetInnerHTML: {
                                __html: element.text.replace(/\n/g, "\n" + off)
                            } }));
                        return;
                    }
                    if (element.is_click) {
                        var subsink = [];
                        fill_with_tml(element.text, subsink, off);
                        sink.push(React.createElement(
                            "span",
                            { className: "code_link", onClick: element.f },
                            subsink
                        ));
                        return;
                    }
                    throw "WTF?!";
                }
            }
        },
        get: function get(width) {
            if (self.line_group.label != null) {
                throw "WTF?!";
            }

            var pres = [];
            render_group(self.line_group, true, pres);
            return React.createElement(
                "div",
                { className: "sourceCode" },
                pres
            );

            function render_group(group, is_last_group, pres) {
                var widthStyle = {};
                if (width) {
                    widthStyle.width = "" + width + "ch";
                }

                var text = [];
                for (var i = 0; i < group.lines.length; i++) {
                    var isLast = i == group.lines.length - 1;
                    var line = group.lines[i];
                    if (line.is_group) {
                        pres.push(React.createElement(
                            "pre",
                            { style: widthStyle },
                            text
                        ));
                        text = [];
                        var sub = [];
                        render_group(line, isLast && is_last_group, sub);
                        pres.push(React.createElement(
                            "div",
                            { className: "sourceCode " + line.label },
                            sub
                        ));
                    } else {
                        if (line.is_current) {
                            pres.push(React.createElement(
                                "pre",
                                { style: widthStyle },
                                text
                            ));
                            var style = clone(widthStyle);
                            style.backgroundColor = "hsla(" + line.color.h + "," + line.color.s + "%," + "40%," + line.color.a + ")";
                            var lineView = [line.text];
                            if (!(isLast && is_last_group)) {
                                lineView.push(React.createElement(
                                    "span",
                                    null,
                                    "\n"
                                ));
                            }
                            pres.push(React.createElement(
                                "pre",
                                { style: style },
                                lineView
                            ));
                            text = [];
                        } else {
                            text.push(line.text);
                            if (!isLast) {
                                text.push(React.createElement(
                                    "span",
                                    null,
                                    "\n"
                                ));
                            }
                        }
                    }
                }
                pres.push(React.createElement(
                    "pre",
                    { style: widthStyle },
                    text
                ));
            }
        }
    };
    return self;
    function active_threads(threads) {
        var active = [];
        for (var x in threads) {
            if (threads.hasOwnProperty(x)) {
                if (threads[x]) {
                    active.push("" + x);
                }
            }
        }
        return active;
    }
    function repeat(text, n) {
        var off = "";
        for (var i = 0; i < n; i++) {
            off += text;
        }
        return off;
    }
}

function clone(x) {
    return JSON.parse(JSON.stringify(x));
}

},{}],5:[function(require,module,exports){
"use strict";

var YabandehApp = require("./yabandeh/YabandehApp");

ReactDOM.render(React.createElement(YabandehApp, null), document.getElementById('yabandeh-placeholder'));

},{"./yabandeh/YabandehApp":10}],6:[function(require,module,exports){
"use strict";

module.exports = {
    __storage: {},
    __txid: 0,
    get: function get(key) {
        if (!this.__storage.hasOwnProperty(key)) {
            throw "WTF?!";
        }
        return deep_copy(this.__storage[key]);
    },
    put: function put(key, object) {
        object = deep_copy(object);
        this.__storage[key] = object;
    },
    put_cas: function put_cas(key, object, cas) {
        object = deep_copy(object);
        var obj = this.get(key);
        for (var prop in cas) {
            if (cas.hasOwnProperty(prop)) {
                if (obj[prop] != cas[prop]) {
                    return false;
                }
            }
        }
        this.__storage[key] = object;
        return true;
    },
    put_if: function put_if(key, object, test) {
        object = deep_copy(object);
        var obj = this.get(key);
        if (!test(obj)) {
            return false;
        }
        this.__storage[key] = object;
        return true;
    },
    new_tx: function new_tx() {
        var tx_id = "tx:" + this.__txid++;
        var tx = { ver: 0, status: "pending" };
        this.put(tx_id, tx);
        tx.id = tx_id;
        return tx;
    }
};

function deep_copy(object) {
    return JSON.parse(JSON.stringify(object));
}

},{}],7:[function(require,module,exports){
"use strict";

module.exports = React.createClass({
    displayName: "exports",

    renderKeyValueTr: function renderKeyValueTr(key, value) {
        return React.createElement(
            "tr",
            null,
            React.createElement(
                "th",
                null,
                key
            ),
            React.createElement(
                "td",
                null,
                value.ver
            ),
            React.createElement(
                "td",
                null,
                value.value
            ),
            React.createElement(
                "td",
                null,
                value.future
            ),
            React.createElement(
                "td",
                null,
                value.tx_link
            )
        );
    },
    render: function render() {
        var a = this.props.db.get("a");
        var b = this.props.db.get("b");
        var c = this.props.db.get("c");
        return React.createElement(
            "div",
            { className: "info-block dbview" },
            React.createElement(
                "h3",
                null,
                "State"
            ),
            React.createElement(
                "table",
                null,
                React.createElement(
                    "tbody",
                    null,
                    React.createElement(
                        "tr",
                        { className: "header" },
                        React.createElement("th", null),
                        React.createElement(
                            "th",
                            null,
                            "ver"
                        ),
                        React.createElement(
                            "th",
                            null,
                            "value"
                        ),
                        React.createElement(
                            "th",
                            null,
                            "future"
                        ),
                        React.createElement(
                            "th",
                            null,
                            "tx_link"
                        )
                    ),
                    this.renderKeyValueTr("a", a),
                    this.renderKeyValueTr("b", b),
                    this.renderKeyValueTr("c", c)
                )
            )
        );
    }
});

},{}],8:[function(require,module,exports){
"use strict";

module.exports = React.createClass({
    displayName: "exports",

    render: function render() {
        var db = this.props.db;
        var a = db.get("a");
        var b = db.get("b");
        var c = db.get("c");

        var in_use = {};
        in_use[a.tx_link] = true;
        in_use[b.tx_link] = true;
        in_use[c.tx_link] = true;

        var txs = [];
        for (var key in this.props.db.__storage) {
            if (!this.props.db.__storage.hasOwnProperty(key)) continue;
            if (key.indexOf("tx:") != 0) continue;
            txs.push(key);
        }

        txs.sort(function (x, y) {
            return parseInt(x.substring(3)) - parseInt(y.substring(3));
        });

        var cut = [];
        for (var i = Math.max(txs.length - 5, 0); i < txs.length; i++) {
            cut.push(txs[i]);
        }
        txs = cut;

        if (txs.length == 0) {
            return React.createElement("div", { className: "txview" });
        }

        return React.createElement(
            "div",
            { className: "info-block txview" },
            React.createElement(
                "h3",
                null,
                "Transactions"
            ),
            React.createElement(
                "table",
                null,
                React.createElement(
                    "tbody",
                    null,
                    React.createElement(
                        "tr",
                        { className: "header" },
                        React.createElement("th", null),
                        React.createElement(
                            "th",
                            null,
                            "ver"
                        ),
                        React.createElement(
                            "th",
                            null,
                            "status"
                        )
                    ),
                    txs.map(function (tx_key) {
                        var tx = db.get(tx_key);
                        return React.createElement(
                            "tr",
                            null,
                            React.createElement(
                                "th",
                                null,
                                tx_key
                            ),
                            React.createElement(
                                "td",
                                null,
                                tx.ver
                            ),
                            React.createElement(
                                "td",
                                null,
                                tx.status
                            )
                        );
                    })
                )
            )
        );
    }
});

},{}],9:[function(require,module,exports){
"use strict";

var view = require("../stepbystep/view");
var CodeView = view.CodeView;

var ThreadControl = React.createClass({
    displayName: "ThreadControl",

    nextHandler: function nextHandler() {
        this.props.thread.iter();
    },
    abortHandler: function abortHandler() {
        this.props.thread.abort();
    },
    rerunHandler: function rerunHandler() {
        this.props.thread.init();
    },
    render: function render() {
        var controls = [];
        var title = this.props.title;
        if (this.props.thread.is_active) {
            controls.push(React.createElement(
                "span",
                { className: "tv-btn" },
                React.createElement(
                    "button",
                    { onClick: this.nextHandler },
                    "Step"
                )
            ));
            controls.push(React.createElement(
                "span",
                { className: "tv-btn" },
                React.createElement(
                    "button",
                    { onClick: this.abortHandler },
                    "Abort"
                )
            ));
        } else {
            if (this.props.thread.was_active) {
                controls.push(React.createElement(
                    "span",
                    { className: "tv-btn" },
                    React.createElement(
                        "button",
                        { onClick: this.rerunHandler },
                        "Restart"
                    )
                ));
                controls.push(React.createElement(
                    "span",
                    { className: "tv-status" },
                    this.props.thread.was_aborted ? "Aborted" : "Executed"
                ));
            } else {
                controls.push(React.createElement(
                    "span",
                    { className: "tv-btn" },
                    React.createElement(
                        "button",
                        { onClick: this.rerunHandler },
                        "Start"
                    )
                ));
            }
        }
        return React.createElement(
            "div",
            { className: "thread-control" },
            title,
            controls
        );
    }
});

module.exports = React.createClass({
    displayName: "exports",

    render: function render() {
        return React.createElement(
            "div",
            { className: "thread-view" },
            React.createElement(ThreadControl, { title: this.props.title, thread: this.props.thread }),
            React.createElement(CodeView, { dom: this.props.thread.thread })
        );
    }
});

},{"../stepbystep/view":4}],10:[function(require,module,exports){
"use strict";

var YabandehModel = require("./YabandehModel");
var view = require("../stepbystep/view");
var ThreadView = require("./ThreadView");

var CodeView = view.CodeView;
var DBView = require("./DBView");
var TXView = require("./TXView");

module.exports = React.createClass({
    displayName: "exports",

    getInitialState: function getInitialState() {
        YabandehModel.on_state_updated = function (app_model) {
            this.setState(app_model);
        }.bind(this);

        return YabandehModel;
    },

    render: function render() {
        return React.createElement(
            "table",
            null,
            React.createElement(
                "tbody",
                null,
                React.createElement(
                    "tr",
                    null,
                    React.createElement(
                        "td",
                        { className: "first-td" },
                        React.createElement(CodeView, { shift: 2, dom: this.state.clean_read })
                    ),
                    React.createElement(
                        "td",
                        { className: "second-td" },
                        React.createElement(CodeView, { shift: 2, dom: this.state.update }),
                        React.createElement(CodeView, { shift: 2, dom: this.state.commit }),
                        React.createElement(CodeView, { shift: 2, dom: this.state.clean })
                    ),
                    React.createElement(
                        "td",
                        { className: "third-td" },
                        React.createElement(ThreadView, { title: "Swap a and b", thread: this.state.tx1 }),
                        React.createElement(ThreadView, { title: "Swap b and c", thread: this.state.tx2 }),
                        React.createElement(DBView, { db: this.state.db }),
                        React.createElement(TXView, { db: this.state.db })
                    )
                )
            )
        );
    }
});

},{"../stepbystep/view":4,"./DBView":7,"./TXView":8,"./ThreadView":9,"./YabandehModel":11}],11:[function(require,module,exports){
"use strict";

var dsl = require("../stepbystep/dsl");

var Statement = dsl.Statement;
var Abort = dsl.Abort;
var Seq = dsl.Seq;
var Cond = dsl.Cond;
var Fun = dsl.Fun;
var Call = dsl.Call;
var Return = dsl.Return;

var model = require("../stepbystep/model");
var AppModel = model.AppModel;
var ThreadModel = model.ThreadModel;

var hl2 = require("../stepbystep/monokai");

var db = require("./DB");

db.put("a", { ver: 0, value: "\"a\"", future: null, tx_link: null });
db.put("b", { ver: 0, value: "\"b\"", future: null, tx_link: null });
db.put("c", { ver: 0, value: "\"c\"", future: null, tx_link: null });

var __clean_read = Fun(hl2("function clean_read(key) {"), Seq([Statement(hl2("var obj = db.get(key);"), function (ctx) {
    ctx.obj = db.get(ctx.key);
}), Cond("obj.tx_link != null", function (ctx) {
    return ctx.obj.tx_link != null;
}, Seq([Statement(hl2("var status = null;"), function (ctx) {
    ctx.status = null;
}), Statement(hl2("var tx = db.get(obj.tx_link);"), function (ctx) {
    ctx.tx = db.get(ctx.obj.tx_link);
}), Cond("tx.status==\"pending\"", function (ctx) {
    return ctx.tx.status == "pending";
}, Seq([Statement(hl2("var aborted = {status: \"aborted\", ver: tx.ver+1};"), function (ctx) {
    ctx.aborted = { status: "aborted", ver: ctx.tx.ver + 1 };
}), Cond("db.put_cas(obj.tx_link, aborted, {ver: tx.ver}", function (ctx) {
    return db.put_cas(ctx.obj.tx_link, ctx.aborted, { ver: ctx.tx.ver });
}, Seq([Statement("status = \"aborted\";", function (ctx) {
    ctx.status = "aborted";
})]), Seq([Statement(hl2("status = db.get(obj.tx_link).status;"), function (ctx) {
    ctx.status = db.get(ctx.obj.tx_link).status;
})]))]), Seq([Statement(hl2("status = tx.status;"), function (ctx) {
    ctx.status = ctx.tx.status;
})])), Cond("status == \"aborted\"", function (ctx) {
    return ctx.status == "aborted";
}, Seq([Statement(hl2("obj.future = null;"), function (ctx) {
    ctx.obj.future = null;
}), Statement(hl2("obj.tx_link = null;"), function (ctx) {
    ctx.obj.tx_link = null;
}), Return(hl2("return obj;"), function (ctx) {
    return ctx.obj;
})])), Cond("status == \"committed\"", function (ctx) {
    return ctx.status == "committed";
}, Seq([Statement(hl2("var clean = {\n  value: obj.future,\n  ver: obj.ver + 1,\n  tx_link: null\n};"), function (ctx) {
    ctx.clean = { value: ctx.obj.future, ver: ctx.obj.ver + 1, tx_link: null };
}), Statement(hl2("var cond = function(x) {\n  return (x.ver==obj.ver+1) || (x.ver==obj.ver);\n};"), function (ctx) {
    ctx.cond = function (x) {
        return x.ver == obj.ver + 1 || x.ver == ctx.obj.ver;
    };
}), Cond("db.put_if(key, clean, cond)", function (ctx) {
    return db.put_if(ctx.key, ctx.clean, ctx.cond);
}, Seq([Return(hl2("return clean;"), function (ctx) {
    return ctx.clean;
})]))])), Abort(hl2("throw \"exit\";"))])), Return(hl2("return obj;"), function (ctx) {
    return ctx.obj;
})]), "}");

var __update = Fun(hl2("function update(tx_key, key, obj, value) {"), Seq([Statement(hl2("var updated = {\n" + "  value: obj.value,\n" + "  future: value,\n" + "  ver: obj.ver+1,\n" + "  tx_link: tx_key\n" + "};"), function (ctx) {
    ctx.updated = {
        value: ctx.obj.value,
        future: ctx.value,
        ver: ctx.obj.ver + 1,
        tx_link: ctx.tx_key
    };
}), Cond("db.put_cas(\n" + "  key,\n" + "  updated,\n" + "  {ver: obj.ver}\n" + ")", function (ctx) {
    return db.put_cas(ctx.key, ctx.updated, { ver: ctx.obj.ver });
}, Seq([Return(hl2("return updated;"), function (ctx) {
    return ctx.updated;
})])), Abort(hl2("throw \"exit\";"))]), "}");

var __commit = Fun(hl2("function commit(tx_key, tx) {"), Seq([Statement(hl2("var committed = {\n" + "  status: \"committed\",\n" + "  ver: tx.ver+1\n" + "};"), function (ctx) {
    ctx.committed = { status: "committed", ver: ctx.tx.ver + 1 };
}), Cond("!db.put_cas(\n" + "  tx_key,\n" + "  committed,\n" + "  {ver: tx.ver}\n" + ")", function (ctx) {
    return !db.put_cas(ctx.tx_key, ctx.committed, { ver: ctx.tx.ver });
}, Seq([Abort(hl2("throw \"exit\";"))]))]), "}");

var __clean = Fun(hl2("function clean(key, obj) {"), Seq([Statement(hl2("var tidy = {\n" + "  value: obj.future,\n" + "  ver: obj.ver+1,\n" + "  future: null,\n" + "  tx_link: null,\n" + "};"), function (ctx) {
    ctx.tidy = { value: ctx.obj.future, ver: ctx.obj.ver + 1, future: null, tx_link: null };
}), Statement(hl2("db.put_cas(key, tidy, {ver: obj.ver});"), function (ctx) {
    db.put_cas(ctx.key, ctx.tidy, { ver: ctx.obj.ver });
})]), "}");

function get_swap_tx(tx, var1, var2) {
    return Seq([Statement(hl2("var " + tx + " = db.new_tx();"), function (ctx) {
        ctx[tx] = db.new_tx();
    }), Call(hl2("var " + var1 + " = clean_read(\"" + var1 + "\");"), function (ctx) {
        return { key: var1 };
    }, __clean_read, function (ctx, ret) {
        ctx[var1] = ret;
    }), Call(hl2("var " + var2 + " = clean_read(\"" + var2 + "\");"), function (ctx) {
        return { key: var2 };
    }, __clean_read, function (ctx, ret) {
        ctx[var2] = ret;
    }), Call(hl2(var1 + " = update(" + tx + ".id, \"" + var1 + "\", " + var1 + ", " + var2 + ".value);"), function (ctx) {
        return { tx_key: ctx[tx].id, key: var1, obj: ctx[var1], value: ctx[var2].value };
    }, __update, function (ctx, ret) {
        ctx[var1] = ret;
    }), Call(hl2(var2 + " = update(" + tx + ".id, \"" + var2 + "\", " + var2 + ", " + var1 + ".value);"), function (ctx) {
        return { tx_key: ctx[tx].id, key: var2, obj: ctx[var2], value: ctx[var1].value };
    }, __update, function (ctx, ret) {
        ctx[var2] = ret;
    }), Call(hl2("commit(" + tx + ".id, " + tx + ");"), function (ctx) {
        return { tx_key: ctx[tx].id, tx: ctx[tx] };
    }, __commit, function (ctx, ret) {}), Call(hl2("clean(\"" + var1 + "\", " + var1 + ");"), function (ctx) {
        return { key: var1, obj: ctx[var1] };
    }, __clean, function (ctx, ret) {}), Call(hl2("clean(\"" + var2 + "\", " + var2 + ");"), function (ctx) {
        return { key: var2, obj: ctx[var2] };
    }, __clean, function (ctx, ret) {})]);
}

var __tx1 = get_swap_tx("tx1", "a", "b");
var __tx2 = get_swap_tx("tx2", "b", "c");

var app_model = AppModel();
app_model.all_source = Seq([__clean_read, __update, __commit, __clean]);
app_model.clean_read = __clean_read;
app_model.update = __update;
app_model.commit = __commit;
app_model.clean = __clean;
app_model.tx1 = ThreadModel(__tx1, app_model, "0", 182, 25);
app_model.tx2 = ThreadModel(__tx2, app_model, "1", 51, 100);
app_model.db = db;
app_model.ticked = function (thread) {
    app_model.notify();
};
module.exports = app_model;

},{"../stepbystep/dsl":1,"../stepbystep/model":2,"../stepbystep/monokai":3,"./DB":6}]},{},[5]);
