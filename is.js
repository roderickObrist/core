/*jslint
  browser: true,
  node: true,
  regexp: true,
  indent: 2
*/

/*properties
    '__&^*__', allEqual, allTrue, alphaNumeric, alphabetic, array, arrayLike,
    baseObject, bind, bool, call, domain, elm, email, every, exports, filter,
    floating, floor, func, hasOwnProperty, imei, integer, ip, keys, len, length,
    luhn, mac, map, nativeFunc, nodeType, nodeValue, notTrue, number, numeric,
    object, phoneNumber, primative, propertyIsEnumerable, prototype, reduce,
    reverse, size, slice, socket, split, string, tagName, test, textNode,
    toString, toUpperCase, url, args
*/

(function () {
  "use strict";

  /* Class: is
   * This function is a syntactic way of testing for equality, granted it is not that useful but the ease and syntax can be considered useful to some
   *
   * Parameters:
   * value - *var* The base in which comparison is to be made
   * ..args - Any number of optional arguments to check for equality with
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isValueInArgs - *bool* True if the first argument can be found in any of the other arguments
   *
   * Example:
   * (start code)
   * x = 7;
   * //is way
   * is(x, 1, 3, 5, 8, 9) // false
   * //non-is way
   * (
   *  x === 1 ||
   *  x === 3 ||
   *  x === 5 ||
   *  x === 8 ||
   *  x === 9
   * ); //false
   *
   * // fruit finder
   * function isFruit(fruit) {
   *  return is(fruit, 'orange', 'apple', 'bananna'); //etc
   * }
   * // Bool Checker
   * function isBool(bool) {
   *  return is(bool, true, false); //etc
   * }
   *
   * x = 'some Value'
   * arr = ['another', ' way', 'of', 'getting', 'some Value'];
   *
   * //is way
   * is(x, 'another', ' way', 'of', 'getting', 'some Value'); // true
   * //another way
   * (arr.indexOf(x) !== -1); // true
   * (end)
   */
  function is(value) {
    var i = 1,
      len = arguments.length;
    while (i < len) {
      if (value === arguments[i]) {
        return true;
      }
      i += 1;
    }
    return false;
  }

  /* Function: allTrue
   * This function is a nice way of doing type checking under a strict envirionment.
   * When a descriptor contains a false value, allTrue will return false, and store the error on is.notTrue
   *
   * Parameters:
   * descriptors - *object* An Object of "error description": result.
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isEveryResultTrue - *bool* True if all values are true
   *
   * Example
   * (start code)
   * function changeLocation(url) {
   *  if (
   *   is.allTrue({
   *    "url must be a string": is.string(url),
   *    "url must be a valid url": is.url(url)
   *   })
   *  ) {
   *   window.location = url;
   *  } else {
   *   throw new Error(is.notTrue);
   *  }
   * }
   * changeLocation(2345);
   * // Error: url must be a string
   *
   * changeLocation('tgdg');
   * // Error: url must be a valid url
   * (end)
   */
  is.allTrue = function allTrue(descriptors) {
    var i,
      fails = function (i) { return descriptors[i] === false; };

    if (arguments.length !== 1 && is.arrayLike(descriptors)) {
      fails = function (i) {
        return fails.args(descriptors[i]) === false;
      };

      fails.args = Array.prototype.slice.call(arguments, 1);
    }

    for (i in descriptors) {
      if (
        descriptors.hasOwnProperty(i) &&
          fails(i)
      ) {
        is.notTrue = i;
        return false;
      }
    }

    return true;
  };

  /* Function: allEqual
   * This is a simple way of checking that more than one value are equal
   *
   * Parameters:
   * ...args - A set of values
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isEveryValueTheSame - *bool* True if all values are equal to eachother
   *
   * Example
   * (start code)
   * // The trap
   * var w = 1,
   *  x = 1;
   *  y = 1
   *  z = 1;
   * if (w === x === y === z) {
   *  // flow will never make it here
   * }
   *
   * if (w === x && x === y && y === z) {
   *  // this is correct
   * }
   *
   * if (is.allEqual(w, x, y, z)) {
   *  // easy and intuitive
   * }
   * (end)
   */
  is.allEqual = function allEqual() {
    var i = 1;

    while (i < arguments.length) {
      if (arguments[i] !== arguments[i - 1]) {
        return false;
      }

      i += 1;
    }

    return true;
  };

  /* Function: elm
   * This is a simple check for a DOMElement
   *
   * Parameters:
   * elm - *var* The DomElement in question
   * optTagName - *string*(case insensitive) An optional tag name to check for
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isElement - *bool* True if value is an Element
   *
   * (start code)
   * var a = document.createElement('A');
   * is.elm(a); //true
   * is.elm(a, 'a'); //true
   * is.elm(a, 'DIV'); //false
   * is.elm({}); //false
   * (end)
   */
  is.elm = function elm(element, optTagName) {
    return !!element &&
      element.nodeType === 1 &&
      (
        !is.string(optTagName) ||
          element.tagName === optTagName.toUpperCase()
      );
  };

  /* Function: textNode
   * This is a simple check for a DOMTextNode
   *
   * Parameters:
   * elm - *var* The DomElement in question
   * optContent - *string*(case sensitive) An optional textContent to check the node for
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isTextNode - *bool* True if value is a text node
   *
   * (start code)
   * var a = document.createTextNode('Some Text');
   * is.textNode(a); //true
   * is.textNode(a, 'a'); //false
   * is.textNode(a, 'Some Text'); //true
   * is.textNode({}); //false
   * (end)
   */
  is.textNode = function textNode(node, optContent) {
    if (
      !node ||
        node.nodeType !== 3
    ) {
      return false;
    }

    if (is.string(optContent)) {
      return node.nodeValue === optContent;
    }

    if (optContent instanceof RegExp) {
      return optContent.test(node.nodeValue);
    }

    return true;
  };

  /* Function: ip
   * This function will check for a valid v4 IP address.
   *
   * Parameters:
   * value - *string* An Ip Address.
   *
   * Errors:
   * (none)
   *
   * Returns:
   * result - *bool* A boolean indicating if the value is a string and an ip address
   */
  is.ip = function ip(value) {
    if (!is.string(value)) {
      return false;
    }

    value = value.split('.');

    return value.length === 4 &&
      value.every(function (member) {
        return is.integer(+member, 0, 255);
      });
  };

  /* Function: socket
   * This function will check for a valid v4 IP address followed by a colon and a port
   *
   * Parameters:
   * value - *string* The potential socket in the form of ip:port
   *
   * Errors:
   * (none)
   *
   * Returns:
   * result - *bool* A boolean indicating if the value is a string and a standard socket
   */
  is.socket = function socket(value) {
    if (!is.string(value)) {
      return false;
    }

    value = value.split(':');

    return value.length === 2 &&
      is.ip(value[0]) &&
      is.integer(+value[1], 1, 65535);
  };

  /* Function: mac
   * This function will check for a valid MAC address.
   * Valid means any case, 6 sets of two hexadecimal groups separated by either a : or a -
   * eg af:12:be:b4:00:aa
   *
   * Parameters:
   * value - *string* An MAC Address.
   *
   * Errors:
   * (none)
   *
   * Returns:
   * result - *bool* A boolean indicating if the value, when casted to a string is a valid MAC address
   */
  is.mac = function mac(value) {
    return (/^(([0-9a-z]{2}\-){5}|([0-9a-z]{2}\:){5})[0-9a-z]{2}$/i).test(value) ||
      (/^[0-9a-z]{6}[\-\_\:][0-9a-z]{6}$/i).test(value);
  };

  /* Function: imei
   * This function will check for a valid imei.
   * This function checks that the string is numeric and of length 15 or 17 and that the number
   * satisfies the luhn check digit.
   *
   * Parameters:
   * value - *string* An imei number.
   *
   * Errors:
   * (none)
   *
   * Returns:
   * result - *bool* A boolean indicating if the value, when casted to a string a valid imei number.
   */
  is.imei = function (value) {
    return (/^\d{15}(?:\d{2})?$/).test(value) &&
      is.luhn(value.slice(0, 15));
  };

  /* Function: luhn
   * This function will check for if the string contains a luhn check digit.
   *
   * Parameters:
   * value - *string*
   *
   * Errors:
   * (none)
   *
   * Returns:
   * result - *bool* A boolean indicating if the value, when casted to a string passes the luhn check.
   */
  is.luhn = function (value) {
    value = String(value)
      .split('')
      .map(function (value) {
        return parseInt(value, 10);
      })
      .reverse();

    function sum(a, b) {
      return a + b;
    }

    return value.length !== 0 &&
      value.map(function (digit, i) {
        if (i % 2 === 1) {
          digit = 2 * digit;
        }

        return sum(digit % 10, Math.floor(digit / 10));
      }).reduce(sum) % 10 === 0;
  };

  /* Function: domain
   * This function checks that a valid web domain name is passed
   *
   * Parameters:
   * value - *var* Any type that you would like to check
   *
   * Errors:
   * (none)
   *
   * Returns:
   * result - *bool* A boolean indicating if the value is a valid domain name
   */
  is.domain = function domain(value) {
    return (/^[a-z0-9\-_]+(\.[a-z0-9\-_]+)*(\.[a-z]{2,4}){1,2}$/i).test(value);
  };

  /* Function: url
   * This uses an excellent regex from deigo perini @ https://gist.github.com/729294
   *
   * Parameters:
   * value - *string* Any type that you would like to check
   *
   * Errors:
   * (none)
   *
   * Returns:
   * result - *bool* A boolean indicating if the value, when casted to a string is either 'ftp', 'http' or 'https'
   */
  is.url = function url(value) {
    return (/^(?:(?:https?|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?!10(?:\.\d{1,3}){3})(?!127(?:\.\d{1,3}){3})(?!169\.254(?:\.\d{1,3}){2})(?!192\.168(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]+-?)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]+-?)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/i).test(value);
  };

  /* Function: email
   * This checks if the email is (email-permissable-characters)@(<isDomainName>)
   *
   * Parameters:
   * value - *string* The email address
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isEmail - *bool* A boolean indicating if the value is an email address
   */
  is.email = function email(value) {
    if (!is.string(value)) {
      return false;
    }

    value = value.split('@');

    return value.length === 2 &&
      (/^[a-z0-9\._%\-]+$/i).test(value[0]) &&
      is.domain(value[1]);
  };

  /* Function: phoneNumber
   * This function checks for a phone number, due to the number of use cases length could not be checked, so an optional length parameter can be provided
   *
   * Parameters:
   * value - *var* Any value that when casted to a string is checked as a phone number
   * optLength - *int* An optional int that can be used to check the clean length of the number
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isPhoneNumber - *bool* A boolean indicating if the value is a phone number
   */
  is.phoneNumber = function phoneNumber(value, optLength) {
    return is.string(value) &&
      (/^\+?(\([0-9 ]+\))?[0-9 \-]+$/).test(value) &&
      (
        !is.integer(optLength) ||
          value.split('').filter(is.numeric).length === optLength
      );
  };

  /* Function: phoneNumber
   * This function checks for a phone number, due to the number of use cases length could not be checked, so an optional length parameter can be provided
   *
   * Parameters:
   * value - *var* Any value that when casted to a string is checked as a phone number
   * optLength - *int* An optional int that can be used to check the clean length of the number
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isPhoneNumber - *bool* A boolean indicating if the value is a phone number
   */
  is.properName = function properName(value) {
    return /^[A-Z]([a-z]*['`’][A-Za-z])?[a-z]+$/.test(value);
  };

  /* Function: func
   * The function checks the instanceof first, then fallsback on the Object.prototype.toString method, however this still fails in IE8 and below
   * on native functions, so it then calls nativeFunc if the first two fail.
   *
   * Parameters:
   * value - *function* The value to be checked
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isFunction - *bool* A boolean indicating if the value is indeed a function
   */
  is.func = function func(value) {
    return (value instanceof Function) ||
      (typeof value === "function") ||
      (Object.prototype.toString.call(value) === "[object Function]") ||
      /* FOR IE8 USE THE SLOWER METHOD */
      is.nativeFunc(value);
  };

  /* Function: asyncFunc
   * The function checks the instanceof first, then fallsback on the Object.prototype.toString method
   *
   * Parameters:
   * value - *function* The value to be checked
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isFunction - *bool* A boolean indicating if the value is indeed an AsyncFunction
   */
  is.asyncFunc = function asyncFunc(value) {
    return (value instanceof asyncFunc.AsyncFunction) ||
      (Object.prototype.toString.call(value) === "[object AsyncFunction]");
  };

  try {
    is.asyncFunc.AsyncFunction = (async function () {}).constructor;
  } catch (e) {
    // for env that does not support async func
  }

  /* Function: nativeFunc
   * This method will decompile the function by using it's toString method and passing it to a relatively complex regular expression.
   * This method is great for detecting the document.createElements in cross browser situations because typeof function generally fails in IE
   *
   * Parameters:
   * value - *var* Any value you would like to check for a native function
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isNativeFunction - *bool* A boolean indicating if the value is a native C++ function
   */
  is.nativeFunc = function nativeFunc(value) {
    return (/^function\s*[\$\_a-z][\$\_a-z1-9]+\s*\(\)\s*\{\s*\[native code\]\s*\}$/i).test(value);
  };

  /* Function: string
   * On the basic side this function can tell you if the argument is a string, but generally speaking the length is also important.
   * Since there there are numerous use cases in array.filter, array.map, array.every, if the third argument is an array, only the first argument is noticed
   *
   * Parameters:
   * value - *var* The value you would like to check
   * opt1 - *int* Either the minimum acceptable length or the exact length (if opt2 is not provided)
   * opt2 - *int* The maximum acceptable length
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isString - *bool* A boolean indicating if the value is a string
   */
  is.string = function string(value) {
    return (typeof value === 'string') &&
      is.string.len(arguments);
  };

  is.string.len = function (arg) {
    var length = arg[0].length;
    switch (arg.length) {
    case 1:
      return true;
    case 2:
      if (is.func(arg[1])) {
        return Array.prototype.every.call(arg[0], arg[1]);
      }

      return length === arg[1];
    case 3:
      return arg[2] instanceof Array ||
        (
          (length >= arg[1]) &&
          (length <= arg[2])
        );
    }
  };

  /* Function: alphaNumeric
   * This function will check for the existance of strings containing only alpha nummeric values
   *
   * Parameters:
   * value - *var* Any type that you would like to check
   *
   * Errors:
   * (none)
   *
   * Returns:
   * result - *bool* A boolean indicating if the value is alpha-numeric
   *
   */
  is.alphaNumeric = function alphaNumeric(value) {
    return (/^[a-z0-9]+$/i).test(value) &&
      is.string.len(arguments);
  };

  /* Function: alphabetic
   * This function will check for the existance of strings containing only alphabetic values
   *
   * Parameters:
   * value - *var* Any type that you would like to check
   *
   * Errors:
   * (none)
   *
   * Returns:
   * result - *bool* A boolean indicating if the value is alpha-numeric
   */
  is.alphabetic = function alphabetic(value) {
    return (/^[a-z]+$/i).test(value) &&
      is.string.len(arguments);
  };

  /* Function: numeric
   * This function is similiar to PHP's is_numeric function
   *
   * Parameters:
   * value - *var* Any type that you would like to check
   *
   * Errors:
   * (none)
   *
   * Returns:
   * result - *bool* A boolean indicating if the value is nummeric
   */
  is.numeric = function numeric(value) {
    return !isNaN(parseFloat(value)) &&
      isFinite(value);
  };

  /* Function: number
   * This method is assumed to be safer than typeof === 'number', it is NaN protected.
   * Besides the obvious difference, this function is identical to <isInt>
   */
  is.number = function number(value) {
    return (value === +value) &&
      is.number.size(arguments);
  };

  is.number.size = function (arg) {
    switch (arg.length) {
    case 1:
      return true;
    case 3:
      return arg[2] instanceof Array ||
        (
          (arg[0] >= arg[1]) &&
          (arg[0] <= arg[2])
        );
    }
  };

  /* Function: integer
   * This function will check if the passed value is an int, and then provides the option to check the range
   * Since there there are numerous use cases in array.filter, array.map, array.every, if the third argument is an array, only the first argument is noticed
   *
   * Parameters:
   * value - *var* The value you would like to check
   * opt1(optional) - *int* Either the minimum acceptable value
   * opt2(optional) - *int* The maximum acceptable value
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isInt - *bool* A boolean indicating if the value is an integer
   */
  is.integer = function (value) {
    return (value === +value) &&
      (value % 1 === 0) &&
      is.number.size(arguments);
  };

  /* Function: floating
   * Besides the obvious difference, this function is identical to <isInt>
   */
  is.floating = function floating(value) {
    return (value === +value) &&
      (value % 1 !== 0) &&
      is.number.size(arguments);
  };

  /* Function: array
   * This method checks for actual Arrays through either the instanceof or the Object.prototype.toString method.
   * It also provides the option to test the length
   *
   * Parameters:
   * value - *var* The value you would like to check
   * opt1(optional) - *int* Either the minimum acceptable length or the exact length (if arg2 is not provided)
   * opt2(optional) - *int* The maximum acceptable length
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isArray - *bool* A boolean indicating if the value is an array
   */
  is.array = function array(value) {
    return (value instanceof Array) &&
      (Object.prototype.toString.call(value) === "[object Array]") &&
      is.string.len(arguments);
  };

  /* Function: arrayLike
   * This function should be the goto place for testing for array-like structures, such as
   * - the arguments object
   * - html node lists (query selector results or node.children)
   * - Arrays themselves
   *
   * Parameters:
   * value - *var* The value you would like to check
   * opt1(optional) - *int* Either the minimum acceptable length or the exact length (if arg2 is not provided)
   * opt2(optional) - *int* The maximum acceptable length
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isArrayLike - *bool* A boolean indicating if the value is array-like.
   */
  is.arrayLike = function arrayLike(value) {
    return !!value &&
      is.integer(value.length) &&
      (
        (value.hasOwnProperty('length') && !value.propertyIsEnumerable('length')) ||
          Array.prototype.every.call(value, value.hasOwnProperty.bind(value))
      ) &&
      is.string.len(arguments);
  };

  /* Function: primative
   * All primatives in javascript cannot store properties, thus this is how they will be defined. This is basically the opposite to <object>
   *
   * Parameters:
   * value - *var* The value you would like to check
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isPrimative - *bool* A boolean indicating if the value cannot store properties
   */
  is.primative = function primative(value) {
    if (is(value, null, undefined, true, false)) {
      return true;
    }

    /* The try-catch block has been placed
     * incase there is a frozen object
     */
    try {
      value['__&^*__'] = 56;

      if (value['__&^*__'] === 56) {
        delete value['__&^*__'];
        return false;
      }

      return true;
    } catch (e) {
      return false;
    }
  };

  /* Function: object
   * By technical definition, RegExp, Array, Function, even new Boolean() are objects.
   * So basically an object is the opposite of a primative
   *
   * Parameters:
   * value - *var* The value you would like to check
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isObject - *bool* A boolean indicating if the value is an object
   */
  is.object = function object(value) {
    return !is.primative(value);
  };

  /* Function: baseObject
   * This is the real "isObject", not the javascript(where everything is an object) friendly version
   *
   * Parameters:
   * value - *var* The value you would like to check
   * optLength - *int* The number of enumerable keys that are stored on the instance.
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isBaseObject - *bool* A boolean indicating if the value is / can be a result of object literal notation
   */
  is.baseObject = function (value, optLength) {
    return Object.prototype.toString.call(value) === "[object Object]" &&
      (
        !is.integer(optLength) ||
          (Object.keys(value).length === optLength)
      );
  };

  /* Function: bool
   * This checks for all kinds of booleans, including the new Boolean() type
   *
   * Parameters:
   * value - *var* The value you would like to check
   *
   * Errors:
   * (none)
   *
   * Returns:
   * isBoolean - *bool* A boolean indicating if the value is any kind of boolean.
   */
  is.bool = function (value) {
    return Object.prototype.toString.call(value) === "[object Boolean]";
  };

  if (typeof module === 'object') {
    module.exports = is;
  } else if (typeof define === 'function') {
    define(function () {
      return is;
    });
  } else {
    window.is = is;
  }
}());
