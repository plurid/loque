// #region imports
    // #region internal
    import Locator, {
        parseLocator,
    } from './locator';

    import Extractor, {
        handleExtraction,
    } from './extractor';
    // #endregion internal
// #endregion imports




// #region module
const loque = {
    locate: parseLocator,
    extract: handleExtraction,
};
// #endregion module



// #region exports
export {
    Extractor,
    Locator,
};


export default loque;
// #endregion exports
