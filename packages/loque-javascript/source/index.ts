// #region imports
    // #region internal
    import Locator, {
        parseLocator,
        LocatorStatements,
        CollectionStatement as LocatorCollectionStatement,
        DocumentStatement as LocatorDocumentStatement,
    } from './locator';

    import Extractor, {
        handleExtraction,
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
    LocatorStatements,
    LocatorCollectionStatement,
    LocatorDocumentStatement,

    Extractor,

    Updater,
};


export default loque;
// #endregion exports
