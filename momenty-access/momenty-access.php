<?php
/**
 * Plugin Name: Momenty Access
 * Description: Integrates WooCommerce purchases with external game access tokens.
 * Version: 1.2.0
 * Author: Allemedia / Momenty
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'MOMENTY_ACCESS_PLUGIN_PATH', plugin_dir_path( __FILE__ ) );
define( 'MOMENTY_ACCESS_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

/**
 * Core plugin class.
 */
require_once MOMENTY_ACCESS_PLUGIN_PATH . 'includes/class-momenty-access-core.php';

/**
 * Bootstrap the plugin.
 */
function momenty_access_bootstrap() {
    return Momenty_Access_Core::instance();
}
add_action( 'plugins_loaded', 'momenty_access_bootstrap' );

/**
 * Activation / deactivation hooks.
 */
register_activation_hook( __FILE__, array( 'Momenty_Access_Core', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'Momenty_Access_Core', 'deactivate' ) );
