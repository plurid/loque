// #region imports
    // #region internal
    import Locator, {
        parseLocator,
        type LocatorStatements,
        CollectionStatement as LocatorCollectionStatement,
        DocumentStatement as LocatorDocumentStatement,
    } from './locator';

    import Extractor, {
        handleExtraction,
        type ExtractedLoque,
    } from './extractor';

    import Updater, {
        handleUpdate,
    } from './updater';
    // #endregion internal
// #endregion imports




// #region module
const loque = {
    locate: parseLocator,
    extract: handleExtraction,
    update: handleUpdate,
};
// #endregion module



// #region exports
export {
    Locator,
    type LocatorStatements,
    LocatorCollectionStatement,
    LocatorDocumentStatement,

    Extractor,
    type ExtractedLoque,

    Updater,
};


export default loque;
// #endregion exports
