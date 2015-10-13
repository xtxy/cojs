/**
 * Created by clark on 2015/10/12.
 */

var Coroutine = {
    waitTime: 200,
    maxRunCount: 10000,
    strTag: "####",
    strTag1: "@@@@",
    yieldName: "Coroutine.yield",
    waitName: "Coroutine.wait",

    // convert function to string
    _func2Str: function(func){
        // for react function
        if (func.__reactBoundMethod) {
            return func.__reactBoundMethod.toString();
        }

        return func.toString();
    },

    // get new variables and code line
    _parseNewVar: function(vars) {
        var newCode = "";
        var newVars = {};
        var newVarArr = vars.split(",");
        for (var k1 in newVarArr) {
            var line = newVarArr[k1].split("=");
            var newVar = line[0].trim();
            if (line.length == 2) {
                newCode += "ctx." + newVar + "=" + line[1].trim() + ";";
            }

            newVars[newVar] = 1;
        }

        return {str: newCode, vars: newVars};
    },

    // replace coroutine.yield/wait(xxx), to coroutine.yield/wait(xxx);
    _setCoroutineEnd: function(str) {
        var name = "Coroutine";
        var start = 0;
        var index = str.indexOf(name, start);
        while(-1 != index) {
            var left = 0;
            var bracketEnd = false;
            var i = index + name.length;
            for (; i < str.length; i++) {
                if (bracketEnd) {
                    if (str[i] == ";") {
                        break;
                    } else if (str[i] == ",") {
                        if (i == str.length - 1) {
                            str = str.substring(0, i) + ";"
                        } else {
                            str = str.substring(0, i) + ";" + str.substring(i + 1);
                        }
                        break;
                    }
                } else if (str[i] == "(") {
                    left += 1;
                } else if (str[i] == ")") {
                    left -= 1;

                    if (0 == left) {
                        bracketEnd = true;
                    }
                }
            }

            start = i;
            if (start >= str.length) {
                index = -1;
            } else {
                index = str.indexOf(name, start);
            }
        }

        return str;
    },

    // convert ctxArr to ctx object, function to function body str
    _parseFunc: function(ctxArr, func) {
        var funcStr = this._func2Str(func);

        var index1 = funcStr.indexOf("{");
        var index2 = funcStr.lastIndexOf("}");
        var head = funcStr.substring(0, index1 + 1);
        var body = funcStr.substring(index1 + 1, index2);
        // var tail = funcStr.substring(index2);

        var ctx = {};
        var paramNames = ["__self"];
        var params = head.substring(head.indexOf("(") + 1, head.indexOf(")")).trim();
        if ("" != params) {
            var paramArr = params.split(",");
            for (var k = 0; k < paramArr.length; k++) {
                paramNames.push(paramArr[k].trim());
            }
        }

        for (var k = 0; k < paramNames.length; k++) {
            if (k < ctxArr.length) {
                ctx[paramNames[k]] = ctxArr[k];
            } else {
                ctx[paramNames[k]] = null;
            }
        }

        return {ctx: ctx, body: body};
    },

    yield: function(a){},
    start: function(ctxArr, func) {
        var info = this._parseFunc(ctxArr, func);
        this._start(info.ctx, info.body);
    },

    _start: function(ctx, body) {
        // replace multiple continous space to one space
        body = body.replace(/\s+/g, " ");

        var varMap = {};
        if (ctx) {
            // set ctx variables map
            for (var k in ctx) {
                if (0 === k.indexOf("__")) {
                    continue;
                }

                varMap[k] = 1;
            }
        } else {
            ctx = {};
        }

        // split code by ;
        var arr = body.split(";")
        var ret = [];
        for (var k in arr) {
            var str = arr[k].trim();
            var newVars = {};

            // start with var means this is variable definition code
            if (0 === str.indexOf("var")) {
                var varRet = this._parseNewVar(str.substring(4));
                if ("" == varRet.str) {
                    for (var k1 in varRet.vars) {
                        varMap[k1] = 1;
                    }

                    continue;
                } else {
                    newVars = varRet.vars;
                    str = varRet.str;
                }
            }

            // remove "..."
            var strArr = str.match(/".*?"/g);
            if (strArr) {
                str = str.replace(/".*?"/g, this.strTag)
            }

            // remove '...'
            var str1Arr = str.match(/'.*?'/g);
            if (str1Arr) {
                str = str.replace(/'.*?'/g, this.strTag1)
            }

            // format coroutine.yield and coroutine.wait
            str = str.replace(/,\s*Coroutine/g, ";Coroutine");
            str = str.replace(/Coroutine\["(.+?)"\]/g, "Coroutine.$1");
            str = this._setCoroutineEnd(str);

            // replace this pointer
            str = str.replace(/this/g, "ctx.__self");

            // remove space before :, like   {a : "abc"} -> {a: "abc"}
            str = str.replace(/\s*:/g, ":");

            for (var k1 in varMap) {               
                var reg = new RegExp("(^|[^\.])\\b" + k1 + "\\b($|[^:])", "g");
                str = str.replace(reg, "$1ctx." + k1 + "$2");
            }

            // restore '...'
            if (str1Arr) {
                for (var k = 0; k < str1Arr.length; k++) {
                    str = str.replace(this.strTag1, str1Arr[k])
                }
            }

            // restore "..."
            if (strArr) {
                for (var k = 0; k < strArr.length; k++) {
                    str = str.replace(this.strTag, strArr[k])
                }
            }

            // if there is any new variables, add them into variable map
            for (var k1 in newVars) {
                varMap[k1] = 1;
            }

            if (str != "") {
                // may create new ; when process coroutine.xxx, so split this again
                var newStrArr = str.split(";");
                for (var k1 in newStrArr) {
                    var line = newStrArr[k1].trim();
                    if ("" != line) {
                        ret.push(line);
                    }
                }
            }
        }

        var runArr = [];
        var runStr = "";

        // set coroutine.xxx to a single line, combine others into one line
        for (var k = 0; k < ret.length; k++) {
            if (0 !== ret[k].indexOf(this.yieldName) && 0 !== ret[k].indexOf(this.waitName)) {
                runStr = runStr + ret[k] + ";";
            } else {
                if (runStr != "") {
                    runArr.push(runStr);
                    runStr = "";
                }

                runArr.push(ret[k] + ";");
            }
        }

        if (runStr != "") {
            runArr.push(runStr);
        }

        console.log(runArr);

        ctx.__done = false;
        setTimeout(function(){this.run(0, runArr, ctx)}.bind(this), 0);
    },

    run: function(index, runArr, ctx) {
        if (!ctx.__runCount) {
            ctx.__runCount = 1;
        } else {
            ctx.__runCount += 1;
        }

        // prevent dead cycle
        if (ctx.__runCount >= this.maxRunCount) {
            console.log("coroutine.run.count.out");
            return;
        }

        // if current coroutine is waiting for sub coroutine, check sub coroutine state
        if (ctx.__sub) {
            if (ctx.__sub.__done) { // if sub coroutine done, run next line
                index += 1;
                delete ctx.__sub;
            } else { // continue waiting
                setTimeout(function(){this.run(index, runArr, ctx)}.bind(this), this.waitTime);
                return;
            }
        }

        // if finish, set flag
        if (index >= runArr.length) {
            ctx.__done = true;
            return;
        }

        var runStr = runArr[index];
        if (0 === runStr.indexOf(this.yieldName)) { // wait for a variable
            var begin = runStr.indexOf("(");
            var end = runStr.lastIndexOf(")");

            var field = runStr.substring(begin + 1, end).trim();
            var result = eval(field);

            if (!result) {
                setTimeout(function(){this.run(index, runArr, ctx)}.bind(this), this.waitTime);
            } else {
                setTimeout(function(){this.run(index + 1, runArr, ctx)}.bind(this), 0);
            }
        } else if (0 === runStr.indexOf(this.waitName)) { // start sub coroutine
            var begin = runStr.indexOf("(");
            var end = runStr.lastIndexOf(")");

            var field = runStr.substring(begin + 1, end).trim();
            var arr = eval("[" + field + "];");
            if (arr.length != 3) {
                console.log("wrong field for wait:", field);
                return;
            }

            var subFunc = arr[1];

            if (arr[2] && subFunc) {
                var info = this._parseFunc(arr[0], subFunc);
                ctx.__sub = info.ctx;
                this._start(ctx.__sub, info.body);
                setTimeout(function(){this.run(index, runArr, ctx)}.bind(this), this.waitTime);    
            } else {
                setTimeout(function(){this.run(index + 1, runArr, ctx)}.bind(this), 0);
            }
        } else { // run line
            eval(runStr);
            setTimeout(function(){this.run(index + 1, runArr, ctx)}.bind(this), this.waitTime);
        }
    }
};