let disableEventListener = false;
let disableConversion = false;

// save element id for select dropdown boxes for conversion
const currencySelectFrom = 'countryListFrom';
const currencySelectTo = 'countryListTo';

//save element id for input boxes for conversion
const currencyInputFrom = 'currencyInputFrom';
const currencyInputTo = 'currencyInputTo';

//save element id for span that displays currency symbol
const currencySpanSymbolFrom = 'currencySymbolFrom';
const currencySpanSymbolTo = 'currencySymbolTo';

const openDb = () => {
    if (!('indexedDB' in window)) {
        console.log('This browser doesn\'t support IndexedDB');
        return;
    }

    return idb.open('currency-converter-db', 1, upgradeDb => {
        if (!upgradeDb.objectStoreNames.contains('countryList')) {
            upgradeDb.createObjectStore('countryList', {
                keyPath: 'id'
            });
        }

        if (!upgradeDb.objectStoreNames.contains('conversionList')) {
            upgradeDb.createObjectStore('conversionList', {
                keyPath: 'currency'
            });
        }

        if (!upgradeDb.objectStoreNames.contains('conversionHistory')) {
            let store = upgradeDb.createObjectStore('conversionHistory', {
                keyPath: 'time'
            });
            store.createIndex('by-time', 'time');
        }

        if (!upgradeDb.objectStoreNames.contains('countryListOffline')) {
            let store = upgradeDb.createObjectStore('countryListOffline', {
                keyPath: 'id'
            });
            store.createIndex('by-name', 'name');
        }
    });
};

const populateFormSelectList = () => {
    let countryListTo = document.getElementById(currencySelectTo);
    let countryListFrom = document.getElementById(currencySelectFrom);
    return promiseDB.then(db => {
        let tx = db.transaction('countryList');
        let currencyStore = tx.objectStore('countryList');
        return currencyStore.get('countryList');
    }).then(countryMap => {
        for (const country of countryMap.data) {
            let option = document.createElement('option');
            option.setAttribute('value', country[1].id);
            option.appendChild(document.createTextNode(country[1].name));
            countryListFrom.appendChild(option);
            countryListTo.appendChild(option.cloneNode(true));
        }
    }).then(() => {
        showCurrencySymbol(currencySelectFrom, currencySpanSymbolFrom);
        showCurrencySymbol(currencySelectTo, currencySpanSymbolTo);
    });
};

const showCurrencySymbol = (elementID, currencySymbolID) => {
    if (!disableEventListener) {
        return getCurrencySymbol(elementID).then(result => {
            document.getElementById(currencySymbolID).innerText = result.id;
        });
    }
};

const getCurrencySymbol = elementID => {
    if (!disableEventListener) {
        elementID = document.getElementById(elementID);

        // get currency name from select box
        let selectedValue = elementID.options[elementID.selectedIndex].text;

        // search for currency symbol in idb
        return promiseDB.then(db => {
            let tx = db.transaction('countryList');
            let currencyStore = tx.objectStore('countryList');
            return currencyStore.get('countryList');
        }).then(countryMap => {
            //return map that contains currency data requested for. symbol has been saved in id property
            return countryMap.data.get(selectedValue);
        });
    }
};

const fetchCountryListOnline = () => {
    // disables event listeners from working until country list has been fetched
    disableEventListener = true;
    let apiUrl = 'https://free.currencyconverterapi.com/api/v5/countries';
    let countryList = new Map();
    return fetch(apiUrl).catch(error => {
        console.error(`Error encountered when fetching API. Error Message: ${error}`);
    }).then(resp => resp.json()).then(data => {
        let countries = data.results;
        return Object.keys(countries).sort().map(key => {
            countryList.set(countries[key].currencyName.toUpperCase(), {
                'id': countries[key].currencyId,
                'name': countries[key].currencyName.toUpperCase(),
                'symbol': countries[key].currencySymbol
            });
        });
    }).then(() => {
        return promiseDB.then(db => {
            let tx = db.transaction('countryList', 'readwrite');
            let currencyStore = tx.objectStore('countryList');
            currencyStore.put({ 'id': 'countryList', 'data': countryList });
        }).then(() => {
            disableEventListener = false;
            console.log('Countries saved to IDB successfully');
        });
    });
};

const combineCurrencySymbol = (elementIDFrom, elementIDTo) => {
    let currencyFrom;
    let currencyTo;
    return getCurrencySymbol(elementIDFrom).then(result => {
        currencyFrom = result.id;
        return getCurrencySymbol(elementIDTo).then(result => {
            currencyTo = result.id;
            return `${currencyFrom}_${currencyTo}`;
        });
    });
};

const fetchConversionRate = (elementIDFrom, elementIDTo) => {
    if (!disableEventListener) {

        // disables calculation of currency rates until rate has been fetched either from idb or online API
        disableConversion = true;

        //save base currency in another variable.
        let elementID = elementIDFrom;

        //fetch combined currency symbol for api request. Format can be NGN_USD
        return combineCurrencySymbol(elementIDFrom, elementIDTo).then(currency => {

            //check if currency conversion request already exists in idb
            return promiseDB.then(db => {
                let tx = db.transaction('conversionList');
                let currencyStore = tx.objectStore('conversionList');
                return currencyStore.get(currency);
            }).then(data => {

                // currency conversion request does not exist. we now fetch from online API
                if (!data) {
                    console.log(`Fetch: Record for ${currency} not found in IDB. Now fetching!`);
                    let apiUrl = `https://free.currencyconverterapi.com/api/v5/convert?q=${currency}&compact=y`;
                    return fetch(apiUrl).catch(error => {
                        console.error(`Error encountered when fetching currency rate. Error Message: ${error}`);
                    }).then(resp => resp.json()).then(data => {
                        let rate = data[currency].val;

                        //save rate to idb
                        return promiseDB.then(db => {
                            let tx = db.transaction('conversionList', 'readwrite');
                            let store = tx.objectStore('conversionList');
                            store.put({ 'currency': currency, 'data': rate });
                        }).then(() => {
                            disableConversion = false;
                            console.log(`Currency rate for ${currency} has been saved.`);

                            // save currency information in idb offline store. when user is offline, we will try to fetch only country list that have been previously requested. that way, we prevent user from attempting to request for conversion for currency that is not available offline.
                            return promiseDB.then(db => {
                                let element;
                                let tx = db.transaction('countryListOffline', 'readwrite');
                                let store = tx.objectStore('countryListOffline');
                                // put record of base currency in offline list
                                element = document.getElementById(currencySelectFrom);
                                store.put({
                                    'id': element.options[element.selectedIndex].text,
                                    'name': element.options[element.selectedIndex].text,
                                    'value': element.options[element.selectedIndex].value
                                });

                                // also put record of target currency in offline list
                                element = document.getElementById(currencySelectTo);
                                store.put({
                                    'id': element.options[element.selectedIndex].text,
                                    'name': element.options[element.selectedIndex].text,
                                    'value': element.options[element.selectedIndex].value
                                });
                            });
                        });
                    });
                } else {
                    disableConversion = false;
                    console.log(`Fetch: ${currency} Record already in IDB. No need to fetch online`);
                }
            });
        });
    }
};

const promiseDB = openDb();

const addToHistory = (date, conversionText, conversionFooter, saveToIDB = true) => {
    let data = `<div>
<h6 class="my-0">${date}</h6>
<small class="text-muted">${conversionText}</small>
</div>
<span class="text-muted">${conversionFooter}</span>`;

    let conversionHistoryDivCount = document.querySelectorAll('.list-group-item').length;
    let conversionHistoryDiv = document.getElementById('conversionHistory');
    if (conversionHistoryDivCount > 6) {
        conversionHistoryDiv.removeChild(conversionHistoryDiv.childNodes[6]);
    }
    let conversionHistoryCounter = document.getElementById('conversionHistoryCounter');
    if (parseInt(conversionHistoryCounter.innerHTML) < 7) {
        conversionHistoryCounter.innerHTML = parseInt(conversionHistoryCounter.innerHTML) + 1;
    }
    let item = document.createElement("li");
    item.className = 'list-group-item d-flex justify-content-between lh-condensed';
    item.innerHTML = data;
    conversionHistoryDiv.insertBefore(item, conversionHistoryDiv.childNodes[0]);

    if (saveToIDB) {
        promiseDB.then(db => {
            let tx = db.transaction('conversionHistory', 'readwrite');
            let store = tx.objectStore('conversionHistory');
            store.put({
                'time': new Date().getTime(),
                'date': getDate(),
                'conversionText': conversionText,
                'conversionFooter': conversionFooter
            });

            store.index('by-time').openCursor(null, "prev").then(cursor => cursor.advance(7)).then(function deleteRest(cursor) {
                if (!cursor) return;
                cursor.delete();
                return cursor.continue().then(deleteRest);
            });
        });
    }
};

const getDate = () => {
    let currentDate = new Date();
    let day = currentDate.getDate();
    let month = currentDate.getMonth() + 1;
    let year = currentDate.getFullYear();
    return `${day}/${month}/${year}`;
};

const processConversion = (elementIDFrom, elementIDTo) => {
    if (!disableConversion) {
        //save base currency in another variable.
        let elementID = elementIDFrom;

        let result;
        let currencyFrom = document.getElementById(currencyInputFrom);
        let currencyTo = document.getElementById(currencyInputTo);

        return combineCurrencySymbol(elementIDFrom, elementIDTo).then(currency => {
            promiseDB.then(db => {
                let tx = db.transaction('conversionList');
                let currencyStore = tx.objectStore('conversionList');
                return currencyStore.get(currency);
            }).then(data => {
                let rate = data.data;
                let elementCurrencyFrom = document.getElementById(elementIDFrom);
                let elementCurrencyTo = document.getElementById(elementIDTo);

                if (elementID === currencySelectFrom) {
                    result = rate * parseFloat(currencyFrom.value);
                    currencyTo.value = result.toFixed(2);

                    //display summary
                    document.getElementById('sumTextFrom').innerHTML = `${currencyFrom.value} ${elementCurrencyFrom.options[elementCurrencyFrom.selectedIndex].text} equals`;
                    document.getElementById('sumTextTo').innerHTML = `${currencyTo.value} ${elementCurrencyTo.options[elementCurrencyTo.selectedIndex].text}`;

                    // save history data
                    addToHistory(getDate(), `Converted ${elementCurrencyFrom.options[elementCurrencyFrom.selectedIndex].value} ${currencyFrom.value} to ${elementCurrencyTo.options[elementCurrencyTo.selectedIndex].value} ${currencyTo.value}`, `${elementCurrencyFrom.options[elementCurrencyFrom.selectedIndex].value}/${elementCurrencyTo.options[elementCurrencyTo.selectedIndex].value}`);
                } else if (elementID === currencySelectTo) {
                    result = rate * parseFloat(currencyTo.value);
                    currencyFrom.value = result.toFixed(2);

                    //display summary
                    document.getElementById('sumTextFrom').innerHTML = `${currencyTo.value} ${elementCurrencyFrom.options[elementCurrencyFrom.selectedIndex].text} equals`;
                    document.getElementById('sumTextTo').innerHTML = `${currencyFrom.value} ${elementCurrencyFrom.options[elementCurrencyTo.selectedIndex].text}`;

                    addToHistory(getDate(), `Converted ${elementCurrencyFrom.options[elementCurrencyFrom.selectedIndex].value} ${currencyTo.value} to ${elementCurrencyTo.options[elementCurrencyTo.selectedIndex].value} ${currencyFrom.value}`, `${elementCurrencyFrom.options[elementCurrencyFrom.selectedIndex].value}/${elementCurrencyTo.options[elementCurrencyTo.selectedIndex].value}`);
                }
            });
        });
    }
};

const saveCountryListToDB = () => {
    document.getElementById(currencySelectFrom).innerHTML = '';
    document.getElementById(currencySelectTo).innerHTML = '';
    promiseDB.then(db => {
        let tx = db.transaction('countryList');
        let currencyStore = tx.objectStore('countryList');
        let countRequest = currencyStore.count();
        countRequest.then(count => {
            if (count <= 0) {
                fetchCountryListOnline().then(() => {
                    populateFormSelectList();
                });
            } else {
                populateFormSelectList();
            }
        });
    });
};

const showConversionHistory = () => {
    return promiseDB.then(db => {
        let tx = db.transaction('conversionHistory');
        let currencyStore = tx.objectStore('conversionHistory');
        let index = currencyStore.index('by-time');
        return index.getAll();
    }).then(history => {
        history.forEach(data => {
            addToHistory(data.date, data.conversionText, data.conversionFooter, false);
        });
    });
};

const showCountryListOffline = () => {
    document.getElementById(currencySelectFrom).innerHTML = '';
    document.getElementById(currencySelectTo).innerHTML = '';
    return promiseDB.then(db => {
        let tx = db.transaction('countryListOffline');
        let currencyStore = tx.objectStore('countryListOffline');
        let index = currencyStore.index('by-name');
        return index.getAll();
    }).then(list => {
        list.forEach(data => {
            let option = document.createElement('option');
            option.setAttribute('value', data.value);
            option.appendChild(document.createTextNode(data.name));
                document.getElementById(currencySelectFrom).appendChild(option);
                document.getElementById(currencySelectTo).appendChild(option.cloneNode(true));
        });
    }).then(() => {
        showCurrencySymbol(currencySelectFrom, currencySpanSymbolFrom);
        showCurrencySymbol(currencySelectTo, currencySpanSymbolTo);
    });
};

const showMessage = (type, message) => {
    if (type === 'success') {
        document.getElementById('onlineMessage').innerHTML = `
<div class="alert alert-primary" role="alert">
${message}
</div>`;
    } else {
        document.getElementById('onlineMessage').innerHTML = `
<div class="alert alert-danger" role="alert">
        ${message}
    </div>`;
    }
};

const resetInputFields = () => {
    document.getElementById(currencyInputFrom).value = '';
    document.getElementById(currencyInputTo).value = '';
};

window.addEventListener('load', e => {
    if (navigator.onLine) {
        saveCountryListToDB();
        showMessage('success', 'You are connected to the Internet. We will process conversion requests for all countries.');
    } else {
        showCountryListOffline();
        showMessage('danger', 'You are browsing offline. We will process conversion requests for only currencies that have been previously requested for.');
    }
}, false);

window.addEventListener('online', () => {
    console.log('Hi');
    alert('You are back online!');
    showMessage('success', 'You are connected to the Internet. We will process conversion requests for all countries.');
    saveCountryListToDB();
    resetInputFields();
});

window.addEventListener('offline', () => {
    alert('You are offline!');
    showMessage('danger', 'You are browsing offline. We will process conversion requests for only currencies that have been previously requested for.');
    showCountryListOffline();
    resetInputFields();
});

showConversionHistory();

document.getElementById(currencySelectFrom).addEventListener('change', () => {
    showCurrencySymbol(currencySelectFrom, currencySpanSymbolFrom);
    fetchConversionRate(currencySelectFrom, currencySelectTo).then(() => {
        if (parseFloat(document.getElementById(currencyInputFrom).value) > 0) {
            processConversion(currencySelectFrom, currencySelectTo);
        }
    });
    fetchConversionRate(currencySelectTo, currencySelectFrom);
});

document.getElementById(currencyInputFrom).addEventListener('focus', () => {
    fetchConversionRate(currencySelectFrom, currencySelectTo);
});

document.getElementById(currencyInputFrom).addEventListener('keypress', () => {
    processConversion(currencySelectFrom, currencySelectTo);
});

document.getElementById(currencySelectTo).addEventListener('change', () => {
    showCurrencySymbol(currencySelectTo, currencySpanSymbolTo);
    fetchConversionRate(currencySelectTo, currencySelectFrom).then(() => {
        if (parseFloat(document.getElementById(currencyInputTo).value) > 0) {
            processConversion(currencySelectTo, currencySelectFrom);
        }
    });
    fetchConversionRate(currencySelectFrom, currencySelectTo);
});

document.getElementById(currencyInputTo).addEventListener('focus', () => {
    fetchConversionRate(currencySelectTo, currencySelectFrom);
});

document.getElementById(currencyInputTo).addEventListener('keypress', () => {
    processConversion(currencySelectTo, currencySelectFrom);
});